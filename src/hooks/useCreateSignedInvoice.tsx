import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { useInvoiceSeries } from './useInvoiceSeries';
import { useSendInvoiceNotification } from './useSendInvoiceNotification';
import { toast } from 'sonner';

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  session_id?: string;
  billable_event_id?: string;
  bono_id?: string;
}

interface CreateSignedInvoiceParams {
  patientId: string;
  invoiceType: 'simplified' | 'complete';
  items: InvoiceItem[];
  notes?: string;
  seriesId?: string;
  sendNotification?: boolean;
  patientEmail?: string | null;
  patientPhone?: string | null;
  bonoId?: string;
  /**
   * If 'draft', creates invoice as draft (no number, no verifactu).
   * Used for bonos where invoice is issued on first payment.
   */
  statusOverride?: 'draft' | 'issued';
}

interface CreateSignedInvoiceResult {
  invoiceId: string | null;
  verifactuSuccess: boolean;
  verifactuPending: boolean;
  verifactuError?: string;
  notificationSent: boolean;
  whatsappLink?: string | null;
}

export function useCreateSignedInvoice() {
  const queryClient = useQueryClient();
  const { center } = useCenter();
  const { series } = useInvoiceSeries();
  const sendNotification = useSendInvoiceNotification();

  const getDefaultSeries = (type: 'simplified' | 'complete') => {
    const seriesType = type === 'simplified' ? 'simplified' : 'complete';
    return series?.find(s => s.invoice_type === seriesType && !s.is_archived);
  };

  const mutation = useMutation({
    mutationFn: async (params: CreateSignedInvoiceParams): Promise<CreateSignedInvoiceResult> => {
      const {
        patientId,
        invoiceType,
        items,
        notes,
        seriesId,
        sendNotification: shouldSendNotification,
        patientEmail,
        patientPhone,
        statusOverride,
      } = params;

      const isDraft = statusOverride === 'draft';

      if (!center?.id) {
        throw new Error('No se ha encontrado el centro');
      }

      const result: CreateSignedInvoiceResult = {
        invoiceId: null,
        verifactuSuccess: false,
        verifactuPending: false,
        notificationSent: false,
      };

      // 1. Get series
      const targetSeriesId = seriesId || getDefaultSeries(invoiceType)?.id;
      if (!targetSeriesId) {
        throw new Error('No hay una serie de facturación configurada. Configúrala en Ajustes > Facturación.');
      }

      // Get series details
      const { data: seriesData, error: seriesError } = await supabase
        .from('invoice_series')
        .select('*')
        .eq('id', targetSeriesId)
        .single();

      if (seriesError || !seriesData) {
        throw new Error('Error al obtener la serie de facturación');
      }

      // 2. Generate invoice number from series format (or BORRADOR for drafts)
      const year = new Date().getFullYear();
      const nextNumber = seriesData.next_number || 1;
      const paddedNumber = nextNumber.toString().padStart(5, '0');
      
      let invoiceNumber: string;
      if (isDraft) {
        // For drafts, use a temporary number that will be replaced when issued
        invoiceNumber = `BORRADOR-${Date.now()}`;
      } else {
        invoiceNumber = seriesData.format
          .replace('{SERIE}', seriesData.name)
          .replace('{AAAA}', year.toString())
          .replace('{AA}', year.toString().slice(-2))
          .replace('{NNNNN}', paddedNumber)
          .replace('{NNNN}', nextNumber.toString().padStart(4, '0'))
          .replace('{NNN}', nextNumber.toString().padStart(3, '0'));
      }

      // 3. Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      const taxAmount = items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
      const total = subtotal + taxAmount;

      // 4. Create the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([{
          center_id: center.id,
          patient_id: patientId,
          series_id: targetSeriesId,
          invoice_number: invoiceNumber,
          status: isDraft ? 'draft' : 'issued',
          issue_date: isDraft ? null : new Date().toISOString().split('T')[0],
          subtotal,
          tax_rate: items[0]?.tax_rate || 0,
          tax_amount: taxAmount,
          total,
          notes: notes || (isDraft ? 'Factura borrador (pendiente de emisión)' : 'Factura generada automáticamente'),
        }])
        .select()
        .single();

      if (invoiceError || !invoice) {
        throw new Error('Error al crear la factura: ' + (invoiceError?.message || 'Unknown error'));
      }

      result.invoiceId = invoice.id;

      // 5. Handle billable_event for session-based invoices
      const sessionId = items[0]?.session_id;
      let billableEventId: string | null = null;

      if (sessionId) {
        // Check if billable_event already exists for this session
        const { data: existingBE } = await supabase
          .from('billable_events')
          .select('id')
          .eq('session_id', sessionId)
          .maybeSingle();

        if (existingBE) {
          billableEventId = existingBE.id;
          // Update status to settled
          await supabase
            .from('billable_events')
            .update({ billing_status: 'settled' })
            .eq('id', existingBE.id);
        } else {
          // Create new billable_event
          const { data: newBE, error: beError } = await supabase
            .from('billable_events')
            .insert({
              session_id: sessionId,
              patient_id: patientId,
              center_id: center.id,
              amount: total,
              concept: items[0].description,
              billing_status: 'settled',
            })
            .select()
            .single();

          if (!beError && newBE) {
            billableEventId = newBE.id;
          }
        }

        // Link debt to invoice and update existing payments
        const { data: existingDebt } = await supabase
          .from('debts')
          .select('id, paid_amount, amount')
          .eq('session_id', sessionId)
          .maybeSingle();

        if (existingDebt) {
          // Update debt to link to invoice
          await supabase
            .from('debts')
            .update({ invoice_id: invoice.id })
            .eq('id', existingDebt.id);

          // If debt is already paid, mark invoice as paid
          if (Number(existingDebt.paid_amount) >= Number(existingDebt.amount)) {
            await supabase
              .from('invoices')
              .update({ status: 'paid' })
              .eq('id', invoice.id);
          }
        } else {
          // Create debt for this invoice
          await supabase
            .from('debts')
            .insert({
              session_id: sessionId,
              patient_id: patientId,
              center_id: center.id,
              amount: total,
              paid_amount: 0,
              status: 'pending',
              invoice_id: invoice.id,
            });
        }

        // Update existing payments for this session to link to invoice
        await supabase
          .from('payments')
          .update({ invoice_id: invoice.id })
          .eq('session_id', sessionId)
          .is('invoice_id', null);
      }

      // 6. Create invoice items with billable_event_id and bono_id
      const invoiceItems = items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        total: item.total,
        session_id: item.session_id || null,
        billable_event_id: billableEventId || item.billable_event_id || null,
        bono_id: item.bono_id || null,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);

      if (itemsError) {
        console.error('Error creating invoice items:', itemsError);
      }

      // 6. Update series counter (only if not draft)
      if (!isDraft) {
        const { error: seriesUpdateError } = await supabase
          .from('invoice_series')
          .update({ next_number: nextNumber + 1 })
          .eq('id', targetSeriesId);

        if (seriesUpdateError) {
          console.error('Error updating series counter:', seriesUpdateError);
        }
      }

      // 7. If Verifactu auto is enabled and certificate is configured, sign the invoice
      // Skip Verifactu for drafts - will be signed when issued
      if (isDraft) {
        // Drafts don't need Verifactu yet
        result.verifactuSuccess = true;
      } else {
        const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;
        const hasCertificate = !!center?.verifactu_certificate_base64;

        if (verifactuAutoEnabled && hasCertificate) {
          try {
            const { data: verifactuData, error: verifactuError } = await supabase.functions.invoke(
              'sign-invoice-verifactu',
              { body: { invoice_id: invoice.id } }
            );

            if (verifactuError) {
              console.error('Verifactu signing error:', verifactuError);
              result.verifactuPending = true;
              result.verifactuError = verifactuError.message;
              
              // Mark invoice as pending Verifactu
              await supabase
                .from('invoices')
                .update({ 
                  verifactu_pending: true,
                  verifactu_retry_count: 1 
                })
                .eq('id', invoice.id);
            } else if (verifactuData?.success) {
              result.verifactuSuccess = true;
            } else {
              result.verifactuPending = true;
              result.verifactuError = verifactuData?.error || 'Error desconocido en Verifactu';
              
              await supabase
                .from('invoices')
                .update({ 
                  verifactu_pending: true,
                  verifactu_retry_count: 1 
                })
                .eq('id', invoice.id);
            }
          } catch (error) {
            console.error('Verifactu error:', error);
            result.verifactuPending = true;
            result.verifactuError = error instanceof Error ? error.message : 'Error de conexión';
            
            await supabase
              .from('invoices')
              .update({ 
                verifactu_pending: true,
                verifactu_retry_count: 1 
              })
              .eq('id', invoice.id);
          }
        } else {
          // Verifactu not enabled or no certificate - consider it "successful" for flow purposes
          result.verifactuSuccess = true;
        }
      }

      // 8. Send notification ONLY if Verifactu succeeded (or wasn't required)
      if (shouldSendNotification && result.verifactuSuccess) {
        const sendChannel = (center?.invoice_send_channel as 'email' | 'whatsapp' | 'both') || 'email';
        
        try {
          const notificationResult = await sendNotification.mutateAsync({
            invoiceId: invoice.id,
            patientId,
            patientEmail,
            patientPhone,
            channel: sendChannel,
          });

          result.notificationSent = true;
          result.whatsappLink = notificationResult?.whatsappLink || null;
        } catch (error) {
          console.error('Error sending notification:', error);
          // Don't fail the whole operation if notification fails
        }
      } else if (shouldSendNotification && result.verifactuPending) {
        // Notification will be sent later when Verifactu succeeds
        toast.info('La factura está pendiente de registro en AEAT. El envío al cliente se realizará cuando se complete el registro.');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-series'] });
      queryClient.invalidateQueries({ queryKey: ['session-invoice-status'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return mutation;
}

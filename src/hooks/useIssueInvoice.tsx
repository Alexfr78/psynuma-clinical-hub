import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';
import { assertInvoiceSeriesMatches, type SelectableInvoiceSeries } from '@/lib/invoice-series';

interface IssueInvoiceResult {
  success: boolean;
  invoiceNumber?: string;
  verifactuSuccess: boolean;
  verifactuPending: boolean;
  verifactuError?: string;
}

/**
 * Hook to issue a draft invoice (draft → issued) and optionally sign with Verifactu.
 * This is used when the first payment is made on a bono invoice.
 */
export function useIssueInvoice() {
  const queryClient = useQueryClient();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async (invoiceId: string): Promise<IssueInvoiceResult> => {
      if (!center?.id) {
        throw new Error('No se ha encontrado el centro');
      }

      const result: IssueInvoiceResult = {
        success: false,
        verifactuSuccess: false,
        verifactuPending: false,
      };

      // 1. Get invoice and check status
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, series:invoice_series(*)')
        .eq('id', invoiceId)
        .single() as { data: any; error: any };

      if (invoiceError || !invoice) {
        throw new Error('Factura no encontrada');
      }

      // Only process if invoice is draft
      if (invoice.status !== 'draft') {
        console.log('[useIssueInvoice] Invoice is not draft, skipping issue process');
        result.success = true;
        result.verifactuSuccess = true;
        result.invoiceNumber = invoice.invoice_number;
        return result;
      }

      // 2. Get the series and generate invoice number
      const seriesId = invoice.series_id;
      if (!seriesId) {
        throw new Error('La factura no tiene serie asignada');
      }

      const { data: seriesData, error: seriesError } = await supabase
        .from('invoice_series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError || !seriesData) {
        throw new Error('Error al obtener la serie de facturación');
      }

      if (!invoice.invoice_type) {
        throw new Error('El borrador no tiene un tipo de factura guardado. Revísalo antes de emitirlo.');
      }
      assertInvoiceSeriesMatches(
        seriesData as unknown as SelectableInvoiceSeries,
        invoice.invoice_type,
        'ordinary',
      );
      if (seriesData.center_id !== center.id) {
        throw new Error('La serie de facturación pertenece a otro centro.');
      }

      // Generate invoice number from series format
      const year = new Date().getFullYear();
      const nextNumber = seriesData.next_number || 1;
      const paddedNumber = nextNumber.toString().padStart(5, '0');
      
      const invoiceNumber = seriesData.format
        .replace('{SERIE}', seriesData.name)
        .replace('{AAAA}', year.toString())
        .replace('{AA}', year.toString().slice(-2))
        .replace('{NNNNN}', paddedNumber)
        .replace('{NNNN}', nextNumber.toString().padStart(4, '0'))
        .replace('{NNN}', nextNumber.toString().padStart(3, '0'));

      // 3. Update invoice to issued
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          status: 'issued',
          invoice_number: invoiceNumber,
          issue_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', invoiceId);

      if (updateError) {
        throw new Error('Error al emitir la factura: ' + updateError.message);
      }

      // 4. Update series counter
      await supabase
        .from('invoice_series')
        .update({ next_number: nextNumber + 1 })
        .eq('id', seriesId);

      result.success = true;
      result.invoiceNumber = invoiceNumber;

      // 5. Auto-create / reuse debt for this invoice
      const { data: existingDebt } = await supabase
        .from('debts')
        .select('id')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (!existingDebt) {
        const patientId = invoice.patient_id;
        const invoiceTotal = Number(invoice.total);
        let sessionId: string | null = invoice.session_id || null;

        // Invoice header has no session_id column; resolve session via invoice_items
        if (!sessionId) {
          const { data: itemSessions } = await supabase
            .from('invoice_items')
            .select('session_id')
            .eq('invoice_id', invoiceId)
            .not('session_id', 'is', null);
          const uniqueSessions = Array.from(
            new Set((itemSessions || []).map((i) => i.session_id).filter(Boolean))
          );
          if (uniqueSessions.length === 1) {
            sessionId = uniqueSessions[0] as string;
          }
        }

        if (patientId && invoiceTotal > 0) {
          // If a session-level pending debt already exists (e.g. created by
          // the daily generate-pending-debts cron before the invoice was
          // issued), reuse it instead of inserting a duplicate.
          let reusedDebtId: string | null = null;
          if (sessionId) {
            const { data: sessionDebts } = await supabase
              .from('debts')
              .select('id')
              .eq('session_id', sessionId)
              .is('invoice_id', null)
              .neq('status', 'refunded')
              .order('created_at', { ascending: false });

            if (sessionDebts && sessionDebts.length > 0) {
              const [first, ...duplicates] = sessionDebts;
              reusedDebtId = first.id;
              await supabase
                .from('debts')
                .update({
                  invoice_id: invoiceId,
                  amount: invoiceTotal,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', first.id);

              // Clean up any stale duplicate pending debts for the same session
              if (duplicates.length > 0) {
                await supabase
                  .from('debts')
                  .delete()
                  .in('id', duplicates.map((d) => d.id));
              }
            }
          }

          if (!reusedDebtId) {
            await supabase
              .from('debts')
              .insert({
                invoice_id: invoiceId,
                patient_id: patientId,
                center_id: center!.id,
                amount: invoiceTotal,
                paid_amount: 0,
                status: 'pending' as const,
                due_date: new Date().toISOString().split('T')[0],
                session_id: sessionId,
              });
          }
        }
      }


      // 6. Sign with Verifactu if enabled
      const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;
      const hasCertificate = !!center?.verifactu_certificate_base64;

      if (verifactuAutoEnabled && hasCertificate) {
        try {
          const { data: verifactuData, error: verifactuError } = await supabase.functions.invoke(
            'sign-invoice-verifactu',
            { body: { invoice_id: invoiceId } }
          );

          if (verifactuError) {
            console.error('Verifactu signing error:', verifactuError);
            result.verifactuPending = true;
            result.verifactuError = verifactuError.message;
            
            await supabase
              .from('invoices')
              .update({ 
                verifactu_pending: true,
                verifactu_retry_count: 1 
              })
              .eq('id', invoiceId);
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
              .eq('id', invoiceId);
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
            .eq('id', invoiceId);
        }
      } else {
        result.verifactuSuccess = true;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-series'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (error) => {
      toast.error('Error al emitir la factura: ' + error.message);
    },
  });
}

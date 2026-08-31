// Generación de factura automática por pago online. Fuente ÚNICA usada por
// stripe-webhook (checkout/PI) y charge-cancellation (cobro off-session), para
// no duplicar la lógica fiscal (numeración de serie, Verifactu, notificación).

interface InvoiceSeries {
  id: string;
  name: string;
  format: string;
  next_number: number;
  invoice_type: string;
  series_type: string;
  is_default: boolean;
  is_archived: boolean;
}

export async function createInvoice(
  // The webhook and cancellation functions currently use different Supabase
  // client package versions. Keep this shared boundary structural until the
  // edge-function runtimes are aligned.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  centerId: string,
  patientId: string,
  description: string,
  amount: number,
  linkedSessionId: string | null,
  linkedBonoId: string | null,
): Promise<{ invoiceId: string | null; accessToken: string | null }> {
  console.log('Creating invoice for:', { centerId, patientId, amount });

  try {
    const { data: center } = await supabase
      .from('centers')
      .select('id, invoice_on_payment_mode, invoice_send_channel, verifactu_auto_enabled, verifactu_certificate_base64, default_tax_rate')
      .eq('id', centerId)
      .single();

    if (!center) {
      console.error('Center not found');
      return { invoiceId: null, accessToken: null };
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name, tax_id, address, city, postal_code, preferred_invoice_type, email, phone')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      console.error('Patient not found for automatic invoice:', patientError);
      return { invoiceId: null, accessToken: null };
    }

    const invoiceType = patient.preferred_invoice_type === 'complete' ? 'complete' : 'simplified';
    if (invoiceType === 'complete') {
      const missingFiscalFields = [
        !patient.first_name?.trim() || !patient.last_name?.trim() ? 'name' : null,
        !patient.tax_id?.trim() ? 'tax_id' : null,
        !patient.address?.trim() ? 'address' : null,
        !patient.city?.trim() ? 'city' : null,
        !patient.postal_code?.trim() ? 'postal_code' : null,
      ].filter(Boolean);

      if (missingFiscalFields.length > 0) {
        console.error('Automatic complete invoice blocked: missing patient fiscal fields', {
          patientId,
          missingFiscalFields,
        });
        return { invoiceId: null, accessToken: null };
      }
    }

    const { data: compatibleSeries, error: seriesError } = await supabase
      .from('invoice_series')
      .select('*')
      .eq('center_id', centerId)
      .eq('series_type', 'ordinary')
      .eq('invoice_type', invoiceType)
      .eq('is_archived', false)
      .order('name');

    if (seriesError || !compatibleSeries || compatibleSeries.length === 0) {
      console.error('No invoice series found:', seriesError);
      return { invoiceId: null, accessToken: null };
    }

    const defaultSeries = compatibleSeries.find((candidate: InvoiceSeries) => candidate.is_default);
    if (!defaultSeries && compatibleSeries.length > 1) {
      console.error(`Several ${invoiceType} series exist but none is configured as default`);
      return { invoiceId: null, accessToken: null };
    }

    const series = (defaultSeries || compatibleSeries[0]) as InvoiceSeries;

    const year = new Date().getFullYear();
    const nextNumber = series.next_number || 1;
    const paddedNumber = nextNumber.toString().padStart(5, '0');

    const invoiceNumber = series.format
      .replace('{SERIE}', series.name)
      .replace('{AAAA}', year.toString())
      .replace('{AA}', year.toString().slice(-2))
      .replace('{NNNNN}', paddedNumber)
      .replace('{NNNN}', nextNumber.toString().padStart(4, '0'))
      .replace('{NNN}', nextNumber.toString().padStart(3, '0'));

    const taxRate = center.default_tax_rate ?? 0;
    const subtotal = amount;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        center_id: centerId,
        patient_id: patientId,
        series_id: series.id,
        invoice_type: invoiceType,
        invoice_number: invoiceNumber,
        status: 'paid',
        issue_date: new Date().toISOString().split('T')[0],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: `Factura ${invoiceType === 'complete' ? 'completa' : 'simplificada'} generada automáticamente por pago online`,
      })
      .select('id, access_token')
      .single();

    if (invoiceError || !invoiceData) {
      console.error('Error creating invoice:', invoiceError);
      return { invoiceId: null, accessToken: null };
    }

    console.log('Invoice created:', invoiceData.id);

    await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoiceData.id,
        description,
        quantity: 1,
        unit_price: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        session_id: linkedSessionId,
        bono_id: linkedBonoId,
      });

    await supabase
      .from('invoice_series')
      .update({ next_number: nextNumber + 1 })
      .eq('id', series.id);

    if (center.verifactu_auto_enabled && center.verifactu_certificate_base64) {
      try {
        console.log('Signing invoice with Verifactu...');
        const { error: verifactuError } = await supabase.functions.invoke(
          'sign-invoice-verifactu',
          { body: { invoice_id: invoiceData.id } },
        );
        if (verifactuError) {
          console.error('Verifactu signing error:', verifactuError);
          await supabase
            .from('invoices')
            .update({ verifactu_pending: true, verifactu_retry_count: 1 })
            .eq('id', invoiceData.id);
        }
      } catch (error) {
        console.error('Verifactu error:', error);
      }
    }

    const sendChannel = center.invoice_send_channel || 'email';
    const patientData = patient;

    if (patientData) {
      try {
        console.log('Sending invoice notification via:', sendChannel);
        await supabase.functions.invoke('send-invoice-notification', {
          body: {
            invoice_id: invoiceData.id,
            patient_id: patientId,
            patient_email: patientData.email,
            patient_phone: patientData.phone,
            channel: sendChannel,
          },
        });
      } catch (notifError) {
        console.error('Error sending invoice notification:', notifError);
      }
    }

    return { invoiceId: invoiceData.id, accessToken: invoiceData.access_token };
  } catch (error) {
    console.error('Error in createInvoice:', error);
    return { invoiceId: null, accessToken: null };
  }
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  resolvePublicInvoiceRecipient,
  type PublicInvoiceRecipient,
} from '@/lib/publicInvoiceRecipient';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  tax_amount: number | null;
  tax_name: string | null;
  retention_rate: number | null;
  retention_amount: number | null;
  retention_name: string | null;
  total: number;
}

interface InvoiceSeries {
  id: string;
  name: string;
  invoice_type: 'simplified' | 'complete';
  series_type: 'ordinary' | 'rectifying';
}

interface PublicInvoice {
  id: string;
  invoice_number: string;
  invoice_type: 'simplified' | 'complete' | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number | null;
  tax_rate: number | null;
  retention_amount: number | null;
  retention_rate: number | null;
  total: number;
  status: string;
  notes: string | null;
  is_valid: boolean;
  is_recapitulative: boolean | null;
  verifactu_qr: string | null;
  access_token: string;
  // Rectification fields
  series_id: string | null;
  rectified_invoice_id: string | null;
  rectification_type: 'differences' | 'substitution' | null;
  patient: PublicInvoiceRecipient;
  center: {
    name: string;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    province: string | null;
    tax_id: string | null;
    phone: string | null;
    email: string | null;
    invoice_logo_url: string | null;
    invoice_footer: string | null;
    invoice_data_protection_text: string | null;
  };
  series: InvoiceSeries | null;
  items: InvoiceItem[];
}

export function usePublicInvoice(token: string | undefined) {
  return useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async (): Promise<PublicInvoice | null> => {
      if (!token) return null;

      // Fetch invoice by access_token with series join
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_type,
          issue_date,
          due_date,
          subtotal,
          tax_amount,
          tax_rate,
          retention_amount,
          retention_rate,
          total,
          status,
          notes,
          is_valid,
          is_recapitulative,
          verifactu_qr,
          access_token,
          series_id,
          rectified_invoice_id,
          rectification_type,
          recipient_snapshot,
          patient_id,
          center_id
        `)
        .eq('access_token', token)
        .setHeader('x-invoice-token', token)
        .single();

      if (invoiceError || !invoice) {
        console.error('Error fetching invoice:', invoiceError);
        return null;
      }

      // Direct anonymous reads from patients are intentionally blocked. This RPC
      // only returns the recipient linked to the exact invoice access token.
      const { data: patient, error: patientError } = await supabase
        .rpc('get_patient_for_invoice_token', { p_token: token });

      if (patientError) {
        console.error('Error fetching invoice recipient:', patientError);
      }

      // Fetch center data via safe RPC (no credentials exposed)
      const { data: centerData } = await supabase
        .rpc('get_center_for_invoice', { p_center_id: invoice.center_id });
      const center = centerData as unknown as {
        name: string; address: string | null; city: string | null;
        postal_code: string | null; province: string | null; tax_id: string | null;
        phone: string | null; email: string | null; invoice_logo_url: string | null;
        invoice_footer: string | null; invoice_data_protection_text: string | null;
      } | null;

      // Fetch invoice items with token header
      const { data: items } = await supabase
        .from('invoice_items')
        .select('id, description, quantity, unit_price, tax_rate, tax_amount, tax_name, retention_rate, retention_amount, retention_name, total')
        .eq('invoice_id', invoice.id)
        .setHeader('x-invoice-token', token)
        .order('created_at', { ascending: true });

      // Fetch series data if series_id exists
      let series: InvoiceSeries | null = null;
      if (invoice.series_id) {
        const { data: seriesData } = await supabase
          .from('invoice_series')
          .select('id, name, invoice_type, series_type')
          .eq('id', invoice.series_id)
          .setHeader('x-invoice-token', token)
          .single();
        
        if (seriesData) {
          series = seriesData as InvoiceSeries;
        }
      }

      const invoiceType = invoice.invoice_type === 'simplified' || invoice.invoice_type === 'complete'
        ? invoice.invoice_type
        : null;

      return {
        ...invoice,
        invoice_type: invoiceType,
        rectification_type: invoice.rectification_type as 'differences' | 'substitution' | null,
        patient: resolvePublicInvoiceRecipient(invoice.recipient_snapshot, patient),
        center: center || {
          name: '',
          address: null,
          city: null,
          postal_code: null,
          province: null,
          tax_id: null,
          phone: null,
          email: null,
          invoice_logo_url: null,
          invoice_footer: null,
          invoice_data_protection_text: null,
        },
        series,
        items: items || [],
      };
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

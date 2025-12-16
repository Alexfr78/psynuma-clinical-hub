import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

interface PublicInvoice {
  id: string;
  invoice_number: string;
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
  patient: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    tax_id: string | null;
  };
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
  };
  items: InvoiceItem[];
}

export function usePublicInvoice(token: string | undefined) {
  return useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async (): Promise<PublicInvoice | null> => {
      if (!token) return null;

      // Fetch invoice by access_token
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
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
          patient_id,
          center_id
        `)
        .eq('access_token', token)
        .single();

      if (invoiceError || !invoice) {
        console.error('Error fetching invoice:', invoiceError);
        return null;
      }

      // Fetch patient data
      const { data: patient } = await supabase
        .from('patients')
        .select('first_name, last_name, email, phone, address, city, postal_code, tax_id')
        .eq('id', invoice.patient_id)
        .single();

      // Fetch center data
      const { data: center } = await supabase
        .from('centers')
        .select('name, address, city, postal_code, province, tax_id, phone, email, invoice_logo_url, invoice_footer')
        .eq('id', invoice.center_id)
        .single();

      // Fetch invoice items
      const { data: items } = await supabase
        .from('invoice_items')
        .select('id, description, quantity, unit_price, tax_rate, tax_amount, tax_name, retention_rate, retention_amount, retention_name, total')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: true });

      return {
        ...invoice,
        patient: patient || {
          first_name: '',
          last_name: '',
          email: null,
          phone: null,
          address: null,
          city: null,
          postal_code: null,
          tax_id: null,
        },
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
        },
        items: items || [],
      };
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

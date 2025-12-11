import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  center_id: string;
  series_id: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number | null;
  retention_amount: number | null;
  total: number;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  is_recapitulative: boolean;
  notes: string | null;
  verifactu_hash: string | null;
  verifactu_qr: string | null;
  verifactu_timestamp: string | null;
  verifactu_registration_id: string | null;
  verifactu_pending: boolean | null;
  verifactu_retry_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithPatient extends Invoice {
  patients: {
    id: string;
    first_name: string;
    last_name: string;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
  };
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  session_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_name: string;
  tax_amount: number;
  retention_rate: number;
  retention_name: string;
  retention_amount: number;
  total: number;
  created_at: string;
}

export interface InvoiceInsert {
  patient_id: string;
  series_id?: string | null;
  issue_date?: string;
  due_date?: string | null;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  retention_rate?: number;
  retention_amount?: number;
  total: number;
  status?: 'draft' | 'issued' | 'paid' | 'cancelled';
  is_recapitulative?: boolean;
  notes?: string | null;
}

export interface InvoiceItemInsert {
  invoice_id: string;
  session_id?: string | null;
  description: string;
  quantity?: number;
  unit_price: number;
  tax_rate?: number;
  tax_name?: string;
  tax_amount?: number;
  retention_rate?: number;
  retention_name?: string;
  retention_amount?: number;
  total: number;
}

export function useInvoices(filters?: { patientId?: string; status?: string; startDate?: string; endDate?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          *,
          patients (id, first_name, last_name, tax_id, address, city, postal_code)
        `)
        .order('issue_date', { ascending: false });

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status as 'draft' | 'issued' | 'paid' | 'cancelled');
      }
      if (filters?.startDate) {
        query = query.gte('issue_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('issue_date', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as InvoiceWithPatient[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          patients (id, first_name, last_name, tax_id, address, city, postal_code, email, phone)
        `)
        .eq('id', invoiceId!)
        .single();

      if (error) throw error;
      return data as InvoiceWithPatient;
    },
    enabled: !!invoiceId,
  });
}

export function useInvoiceItems(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoice-items', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .order('created_at');

      if (error) throw error;
      return data as InvoiceItem[];
    },
    enabled: !!invoiceId,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ invoice, items }: { invoice: InvoiceInsert; items: Omit<InvoiceItemInsert, 'invoice_id'>[] }) => {
      // Get next invoice number
      const { data: center, error: centerError } = await supabase
        .from('centers')
        .select('invoice_prefix, invoice_next_number')
        .eq('id', profile!.center_id!)
        .single();

      if (centerError) throw centerError;

      const invoiceNumber = `${center.invoice_prefix}-${String(center.invoice_next_number).padStart(5, '0')}`;

      // Create invoice
      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          ...invoice,
          center_id: profile!.center_id!,
          invoice_number: invoiceNumber,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(items.map(item => ({
            ...item,
            invoice_id: newInvoice.id,
          })));

        if (itemsError) throw itemsError;
      }

      // Update next invoice number
      const { error: updateError } = await supabase
        .from('centers')
        .update({ invoice_next_number: center.invoice_next_number + 1 })
        .eq('id', profile!.center_id!);

      if (updateError) throw updateError;

      return newInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['patient-invoices'] });
      toast.success('Factura creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la factura: ' + error.message);
    },
  });
}

// New hook for creating invoices using invoice series
export function useCreateInvoiceWithSeries() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      invoice, 
      items, 
      seriesId 
    }: { 
      invoice: InvoiceInsert; 
      items: (Omit<InvoiceItemInsert, 'invoice_id'> & { session_id?: string })[]; 
      seriesId: string;
    }) => {
      // Get series info
      const { data: series, error: seriesError } = await supabase
        .from('invoice_series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError) throw seriesError;

      // Generate invoice number from series format
      // Format example: {SERIE}-{AAAA}-{NNNNN}
      const year = new Date().getFullYear();
      const invoiceNumber = series.format
        .replace('{SERIE}', series.name)
        .replace('{AAAA}', year.toString())
        .replace('{AA}', year.toString().slice(-2))
        .replace('{NNNNN}', String(series.next_number).padStart(5, '0'))
        .replace('{NNNN}', String(series.next_number).padStart(4, '0'))
        .replace('{NNN}', String(series.next_number).padStart(3, '0'));

      // For draft invoices, we don't assign a number yet - leave it empty or use a placeholder
      const isDraft = invoice.status === 'draft';
      const finalInvoiceNumber = isDraft ? `BORRADOR-${Date.now()}` : invoiceNumber;

      // Create invoice
      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          ...invoice,
          center_id: profile!.center_id!,
          invoice_number: finalInvoiceNumber,
          series_id: seriesId,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(items.map(item => ({
            ...item,
            invoice_id: newInvoice.id,
          })));

        if (itemsError) throw itemsError;
      }

      // Only update series next_number if not a draft
      if (!isDraft) {
        const { error: updateError } = await supabase
          .from('invoice_series')
          .update({ next_number: series.next_number + 1 })
          .eq('id', seriesId);

        if (updateError) throw updateError;
      }

      return newInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['patient-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['session-invoice-status'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-series'] });
      toast.success('Factura creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la factura: ' + error.message);
    },
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Invoice['status'] }) => {
      // Get current invoice to check if it's a draft being issued
      const { data: currentInvoice, error: fetchError } = await supabase
        .from('invoices')
        .select('invoice_number, series_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      let updateData: { status: Invoice['status']; invoice_number?: string } = { status };

      // If issuing a draft, assign proper series number
      if (status === 'issued' && currentInvoice?.invoice_number?.startsWith('BORRADOR-')) {
        let series;

        if (currentInvoice.series_id) {
          // Use the series saved with the invoice
          const { data: seriesData, error: seriesError } = await supabase
            .from('invoice_series')
            .select('*')
            .eq('id', currentInvoice.series_id)
            .single();

          if (seriesError) throw seriesError;
          series = seriesData;
        } else {
          // Fallback to default ordinary series
          const { data: defaultSeries, error: defaultError } = await supabase
            .from('invoice_series')
            .select('*')
            .eq('center_id', profile!.center_id!)
            .eq('series_type', 'ordinary')
            .eq('is_default', true)
            .eq('is_archived', false)
            .maybeSingle();

          if (defaultError) throw defaultError;
          
          if (!defaultSeries) {
            throw new Error('No hay una serie de facturación configurada. Por favor, crea una serie en Configuración > Facturación > Series y numeración.');
          }
          series = defaultSeries;
        }

        // Generate invoice number from series format
        const year = new Date().getFullYear();
        const invoiceNumber = series.format
          .replace('{SERIE}', series.name)
          .replace('{AAAA}', year.toString())
          .replace('{AA}', year.toString().slice(-2))
          .replace('{NNNNN}', String(series.next_number).padStart(5, '0'))
          .replace('{NNNN}', String(series.next_number).padStart(4, '0'))
          .replace('{NNN}', String(series.next_number).padStart(3, '0'));

        updateData.invoice_number = invoiceNumber;

        // Increment series next_number
        const { error: updateSeriesError } = await supabase
          .from('invoice_series')
          .update({ next_number: series.next_number + 1 })
          .eq('id', series.id);

        if (updateSeriesError) throw updateSeriesError;
      }

      const { data, error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['patient-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-series'] });
      toast.success('Estado actualizado');
    },
    onError: (error) => {
      toast.error('Error: ' + error.message);
    },
  });
}

export function useInvoiceStats() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['invoice-stats'],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('invoices')
        .select('total, status')
        .gte('issue_date', startOfMonth)
        .lte('issue_date', endOfMonth);

      if (error) throw error;

      const stats = {
        totalIssued: 0,
        totalPaid: 0,
        totalPending: 0,
        count: data.length,
      };

      data.forEach((inv) => {
        if (inv.status === 'issued' || inv.status === 'paid') {
          stats.totalIssued += Number(inv.total);
        }
        if (inv.status === 'paid') {
          stats.totalPaid += Number(inv.total);
        }
        if (inv.status === 'issued') {
          stats.totalPending += Number(inv.total);
        }
      });

      return stats;
    },
    enabled: !!profile?.center_id,
  });
}

export function useUnbilledSessions(patientId: string | undefined) {
  return useQuery({
    queryKey: ['unbilled-sessions', patientId],
    queryFn: async () => {
      // Get all sessions for this patient
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, price, session_type')
        .eq('patient_id', patientId!)
        .eq('status', 'completed')
        .is('bono_id', null)
        .order('session_date', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Get all invoiced session IDs
      const { data: invoicedItems, error: itemsError } = await supabase
        .from('invoice_items')
        .select('session_id')
        .not('session_id', 'is', null);

      if (itemsError) throw itemsError;

      const invoicedSessionIds = new Set(invoicedItems.map(item => item.session_id));

      // Filter out already invoiced sessions
      return sessions.filter(session => !invoicedSessionIds.has(session.id));
    },
    enabled: !!patientId,
  });
}

// Hook to check if a session is already invoiced
export function useSessionInvoiceStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-invoice-status', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_items')
        .select('invoice_id, invoices(id, invoice_number, status)')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (error) throw error;

      const invoiceData = data?.invoices as { id: string; invoice_number: string; status: string } | null;

      return {
        isInvoiced: !!data,
        invoiceId: data?.invoice_id || null,
        invoiceNumber: invoiceData?.invoice_number || null,
        invoiceStatus: invoiceData?.status || null,
      };
    },
    enabled: !!sessionId,
  });
}

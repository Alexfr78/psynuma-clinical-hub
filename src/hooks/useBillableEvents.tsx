import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface BillableEvent {
  id: string;
  center_id: string;
  session_id: string | null;
  patient_id: string;
  concept: string;
  amount: number;
  billing_status: 'pending' | 'settled';
  created_at: string;
  updated_at: string;
}

export interface BillableEventWithSession extends BillableEvent {
  sessions: {
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    session_type: string | null;
    price: number;
  } | null;
}

// Get or create billable event for a session
export function useGetOrCreateBillableEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      patientId, 
      concept, 
      amount 
    }: { 
      sessionId: string; 
      patientId: string; 
      concept: string; 
      amount: number;
    }) => {
      // Check if billable event already exists for this session
      const { data: existing, error: fetchError } = await supabase
        .from('billable_events')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        return existing as BillableEvent;
      }

      // Create new billable event
      const { data: newEvent, error: createError } = await supabase
        .from('billable_events')
        .insert({
          center_id: profile!.center_id!,
          session_id: sessionId,
          patient_id: patientId,
          concept,
          amount,
          billing_status: 'pending',
        })
        .select()
        .single();

      if (createError) throw createError;
      return newEvent as BillableEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
    },
  });
}

// Get billable event for a session
export function useSessionBillableEvent(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['billable-event', 'session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billable_events')
        .select('*')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (error) throw error;
      return data as BillableEvent | null;
    },
    enabled: !!sessionId,
  });
}

// Get pending billable events for a patient (replaces useUnbilledSessions)
export function usePendingBillableEvents(patientId: string | undefined) {
  return useQuery({
    queryKey: ['pending-billable-events', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billable_events')
        .select(`
          *,
          sessions (
            id,
            session_date,
            start_time,
            end_time,
            session_type,
            price
          )
        `)
        .eq('patient_id', patientId!)
        .eq('billing_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BillableEventWithSession[];
    },
    enabled: !!patientId,
  });
}

// Update billable event status
export function useUpdateBillableEventStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      billing_status 
    }: { 
      id: string; 
      billing_status: 'pending' | 'settled';
    }) => {
      const { data, error } = await supabase
        .from('billable_events')
        .update({ billing_status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-billable-events'] });
    },
  });
}

// Get all invoices for a billable event
export function useBillableEventInvoices(billableEventId: string | undefined) {
  return useQuery({
    queryKey: ['billable-event-invoices', billableEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_items')
        .select(`
          invoice_id,
          invoices (
            id,
            invoice_number,
            status,
            total,
            is_valid,
            rectified_invoice_id,
            issue_date,
            verifactu_registration_id
          )
        `)
        .eq('billable_event_id', billableEventId!);

      if (error) throw error;
      
      // Extract unique invoices
      const invoicesMap = new Map();
      data.forEach(item => {
        if (item.invoices) {
          invoicesMap.set(item.invoice_id, item.invoices);
        }
      });
      
      return Array.from(invoicesMap.values());
    },
    enabled: !!billableEventId,
  });
}

// Get all invoices for a session (via billable event)
export function useSessionInvoices(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-invoices', sessionId],
    queryFn: async () => {
      // First get the billable event for this session
      const { data: billableEvent, error: beError } = await supabase
        .from('billable_events')
        .select('id')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (beError) throw beError;
      if (!billableEvent) return [];

      // Then get all invoices linked to this billable event
      const { data, error } = await supabase
        .from('invoice_items')
        .select(`
          invoice_id,
          invoices (
            id,
            invoice_number,
            status,
            total,
            is_valid,
            rectified_invoice_id,
            issue_date,
            verifactu_registration_id
          )
        `)
        .eq('billable_event_id', billableEvent.id);

      if (error) throw error;
      
      // Extract unique invoices
      const invoicesMap = new Map();
      data.forEach(item => {
        if (item.invoices) {
          invoicesMap.set(item.invoice_id, item.invoices);
        }
      });
      
      return Array.from(invoicesMap.values());
    },
    enabled: !!sessionId,
  });
}

// Check if session can be invoiced (billable event is pending)
export function useCanInvoiceSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['can-invoice-session', sessionId],
    queryFn: async () => {
      const { data: billableEvent, error: beError } = await supabase
        .from('billable_events')
        .select('id, billing_status')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (beError) throw beError;

      if (!billableEvent) {
        return { canInvoice: true, reason: 'no_event' };
      }

      const { data: invoiceItems, error: iiError } = await supabase
        .from('invoice_items')
        .select(`
          invoices!inner (
            id,
            total,
            is_valid,
            status,
            rectified_invoice_id
          )
        `)
        .eq('billable_event_id', billableEvent.id);

      if (iiError) throw iiError;

      const invoices = (invoiceItems || [])
        .map((it) => it.invoices)
        .filter(Boolean) as Array<{ id: string; total: number; is_valid: boolean; status: string; rectified_invoice_id: string | null }>;

      // Find any "live" invoice: an original whose net (original + rectificativas) is not zero
      const hasLive = invoices.some((inv) => {
        if (!inv.is_valid || inv.status === 'cancelled') return false;
        if (inv.rectified_invoice_id) {
          // Orphan rectificativa still counts as live
          return !invoices.some((o) => o.id === inv.rectified_invoice_id);
        }
        const rectSum = invoices
          .filter((r) => r.rectified_invoice_id === inv.id && r.status !== 'cancelled')
          .reduce((acc, r) => acc + Number(r.total || 0), 0);
        return Math.abs(Number(inv.total || 0) + rectSum) > 0.005;
      });

      if (hasLive) {
        return { canInvoice: false, reason: 'has_valid_invoice' };
      }

      return { canInvoice: true, reason: 'pending' };
    },
    enabled: !!sessionId,
  });
}


import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Database } from '@/integrations/supabase/types';

export interface AuditEntry {
  id: string;
  created_at: string;
  seq: number;
  user_id: string | null;
  user_role: string | null;
  organization_id: string | null;
  patient_id: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  justification: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  current_hash: string;
  is_anomalous: boolean;
  anomaly_reason: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
}

type AuditFilters = Omit<Database['public']['Functions']['get_audit_logs']['Args'], 'p_limit' | 'p_offset'>;

function auditQuery(filters: AuditFilters, head = false) {
  // El RPC limita internamente: ampliar ese límite antes de contar y aplicar el rango externo.
  return supabase.rpc('get_audit_logs', { ...filters, p_limit: 2147483647, p_offset: 0 }, { count: 'exact', head });
}

export function useAuditLogsPage(filters: AuditFilters, range: { from: number; to: number }) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['audit-logs', 'page', filters, range.from, range.to, profile?.center_id],
    queryFn: async () => {
      const { data, count, error } = await auditQuery(filters)
        .order('seq', { ascending: false }).order('id', { ascending: true }).range(range.from, range.to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as AuditEntry[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useAuditAnomalyCount(from: string, to: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['audit-anomaly-count', from, to, profile?.center_id],
    queryFn: async () => {
      const { count, error } = await auditQuery({ p_from: from, p_to: to, p_anomalous_only: true }, true);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

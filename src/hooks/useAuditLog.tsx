import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Json } from '@/integrations/supabase/types';

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  table_name: string;
  action: string;
  record_id: string | null;
  old_values: Json | null;
  new_values: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface UseAuditLogParams {
  tableName?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useAuditLog(params: UseAuditLogParams = {}) {
  const { isAdmin } = useAuth();
  const { tableName, action, startDate, endDate, limit = 100 } = params;

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['audit-log', tableName, action, startDate, endDate, limit],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tableName) {
        query = query.eq('table_name', tableName);
      }
      if (action) {
        query = query.eq('action', action);
      }
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AuditLogEntry[];
    },
    enabled: isAdmin,
  });

  return {
    logs: logs || [],
    isLoading,
    refetch,
  };
}

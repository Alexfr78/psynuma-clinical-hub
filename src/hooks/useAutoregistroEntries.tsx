import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { AutoregistroField } from './useAutoregistroTemplates';

export interface AutoregistroEntry {
  id: string;
  link_id: string;
  center_id: string;
  patient_id: string;
  template_id: string;
  values: Record<string, unknown>;
  submitted_at: string;
  template?: { name: string; fields: AutoregistroField[] };
  patient?: { first_name: string; last_name: string | null };
  alertSeverity?: 'critical' | 'warning' | null;
}

export function useAutoregistroEntries(opts?: { patientId?: string; templateId?: string }) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['autoregistro-entries', centerId, opts?.patientId, opts?.templateId],
    queryFn: async () => {
      let q = supabase
        .from('autoregistro_entries')
        .select('*, template:autoregistro_templates(name, fields), patient:patients(first_name, last_name)')
        .eq('center_id', centerId!)
        .order('submitted_at', { ascending: false });
      if (opts?.patientId) q = q.eq('patient_id', opts.patientId);
      if (opts?.templateId) q = q.eq('template_id', opts.templateId);
      const { data, error } = await q;
      if (error) throw error;

      const entries = (data ?? []).map((e) => ({
        ...e,
        template: e.template ? {
          ...e.template,
          fields: typeof e.template.fields === 'string' ? JSON.parse(e.template.fields) : e.template.fields,
        } : undefined,
      })) as AutoregistroEntry[];

      // Load alert severities
      const entryIds = entries.map(e => e.id);
      if (entryIds.length > 0) {
        const { data: logs } = await supabase
          .from('autoregistro_alert_logs')
          .select('entry_id, severity')
          .in('entry_id', entryIds)
          .eq('success', true);

        if (logs && logs.length > 0) {
          const severityMap = new Map<string, 'critical' | 'warning'>();
          for (const log of logs) {
            const current = severityMap.get(log.entry_id);
            if (log.severity === 'critical' || !current) {
              severityMap.set(log.entry_id, log.severity as 'critical' | 'warning');
            }
          }
          for (const entry of entries) {
            entry.alertSeverity = severityMap.get(entry.id) ?? null;
          }
        }
      }

      return entries;
    },
    enabled: !!centerId,
  });
}

export function useDeleteAutoregistroEntries() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientId: string) => {
      const { error } = await supabase
        .from('autoregistro_entries')
        .delete()
        .eq('center_id', centerId!)
        .eq('patient_id', patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-entries'] });
      toast.success('Todos los registros han sido eliminados');
    },
    onError: () => {
      toast.error('Error al eliminar los registros');
    },
  });
}

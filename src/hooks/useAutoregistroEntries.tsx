import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AutoregistroEntry {
  id: string;
  link_id: string;
  center_id: string;
  patient_id: string;
  template_id: string;
  values: Record<string, any>;
  submitted_at: string;
  template?: { name: string; fields: any[] };
  patient?: { first_name: string; last_name: string | null };
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
      return (data ?? []).map((e: any) => ({
        ...e,
        template: e.template ? {
          ...e.template,
          fields: typeof e.template.fields === 'string' ? JSON.parse(e.template.fields) : e.template.fields,
        } : undefined,
      })) as AutoregistroEntry[];
    },
    enabled: !!centerId,
  });
}

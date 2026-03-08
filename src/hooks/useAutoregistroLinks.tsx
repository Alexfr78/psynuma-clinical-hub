import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AutoregistroLink {
  id: string;
  center_id: string;
  template_id: string;
  patient_id: string;
  professional_id: string;
  access_token: string;
  status: string;
  allow_multiple: boolean;
  expires_at: string | null;
  created_at: string;
  template?: { name: string };
  patient?: { first_name: string; last_name: string | null };
}

export function useAutoregistroLinks(opts?: { patientId?: string }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const query = useQuery({
    queryKey: ['autoregistro-links', centerId, opts?.patientId],
    queryFn: async () => {
      let q = supabase
        .from('autoregistro_links')
        .select('*, template:autoregistro_templates(name), patient:patients(first_name, last_name)')
        .eq('center_id', centerId!)
        .order('created_at', { ascending: false });
      if (opts?.patientId) q = q.eq('patient_id', opts.patientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AutoregistroLink[];
    },
    enabled: !!centerId,
  });

  const createLink = useMutation({
    mutationFn: async (input: { template_id: string; patient_id: string; allow_multiple?: boolean; expires_at?: string }) => {
      const { data, error } = await supabase
        .from('autoregistro_links')
        .insert({
          center_id: centerId!,
          template_id: input.template_id,
          patient_id: input.patient_id,
          professional_id: profile!.id,
          allow_multiple: input.allow_multiple ?? true,
          expires_at: input.expires_at || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-links'] });
      toast.success('Enlace creado');
    },
    onError: () => toast.error('Error al crear enlace'),
  });

  const deactivateLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('autoregistro_links').update({ status: 'expired' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-links'] });
      toast.success('Enlace desactivado');
    },
    onError: () => toast.error('Error al desactivar enlace'),
  });

  return { ...query, createLink, deactivateLink };
}

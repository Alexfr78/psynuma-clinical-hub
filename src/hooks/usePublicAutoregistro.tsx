import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';
import type { AutoregistroField } from './useAutoregistroTemplates';
import type { Json } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function getAnonClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: { 'x-autoregistro-token': token },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PublicAutoregistroData {
  link: {
    id: string;
    template_id: string;
    status: string;
    allow_multiple: boolean;
    expires_at: string | null;
  };
  template: {
    id: string;
    name: string;
    description: string | null;
    fields: AutoregistroField[];
    patient_feedback_enabled: boolean;
    patient_feedback_show_date?: boolean;
  };
}

export interface PublicAutoregistroEntry {
  id: string;
  submitted_at: string;
  values: Record<string, unknown>;
}

export function usePublicAutoregistro(token: string) {
  const client = getAnonClient(token);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['public-autoregistro', token],
    queryFn: async (): Promise<PublicAutoregistroData> => {
      const { data: link, error: linkError } = await client
        .from('autoregistro_links')
        .select('id, template_id, status, allow_multiple, expires_at, patient_id, center_id')
        .eq('access_token', token)
        .eq('status', 'active')
        .single();
      if (linkError || !link) throw new Error('Enlace no válido o expirado');

      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        throw new Error('Este enlace ha expirado');
      }

      // Backwards-compat: DB may not have patient_feedback_show_date yet
      let template: {
        id: string; name: string; description: string | null; fields: unknown;
        patient_feedback_enabled?: boolean | null; patient_feedback_show_date?: boolean | null;
      } | null = null;
      let tError: { message?: string } | null = null;
      {
        const res = await client
          .from('autoregistro_templates')
          .select('id, name, description, fields, patient_feedback_enabled, patient_feedback_show_date')
          .eq('id', link.template_id)
          .single();
        template = res.data;
        tError = res.error;
      }

      if (tError && String(tError.message || '').toLowerCase().includes('patient_feedback_show_date')) {
        const res2 = await client
          .from('autoregistro_templates')
          .select('id, name, description, fields, patient_feedback_enabled')
          .eq('id', link.template_id)
          .single();
        template = res2.data;
        tError = res2.error;
      }

      if (tError || !template) throw new Error('Plantilla no encontrada');

      return {
        link: { id: link.id, template_id: link.template_id, status: link.status, allow_multiple: link.allow_multiple, expires_at: link.expires_at },
        template: {
          ...template,
          fields: normalizeAutoregistroFields(
            typeof template.fields === 'string' ? JSON.parse(template.fields) : template.fields
          ),
          patient_feedback_enabled: !!template.patient_feedback_enabled,
          patient_feedback_show_date: template.patient_feedback_show_date ?? true,
        },
      };
    },
    enabled: !!token,
    retry: false,
  });

  const entriesQuery = useQuery({
    queryKey: ['public-autoregistro-entries', token],
    queryFn: async (): Promise<PublicAutoregistroEntry[]> => {
      const { data, error } = await client
        .from('autoregistro_entries')
        .select('id, submitted_at, values')
        .order('submitted_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PublicAutoregistroEntry[];
    },
    enabled: !!token && !!query.data?.template.patient_feedback_enabled,
    retry: false,
  });

  const submitEntry = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!query.data) throw new Error('No data loaded');
      const link = query.data.link;

      const { data: fullLink, error: flError } = await client
        .from('autoregistro_links')
        .select('patient_id, center_id, template_id')
        .eq('access_token', token)
        .single();
      if (flError || !fullLink) throw new Error('Error al enviar');

      const { data: newEntry, error } = await client
        .from('autoregistro_entries')
        .insert({
          link_id: link.id,
          center_id: fullLink.center_id,
          patient_id: fullLink.patient_id,
          template_id: fullLink.template_id,
          values: values as Json,
        })
        .select('id')
        .single();
      if (error) throw error;

      try {
        if (newEntry?.id) {
          await supabase.functions.invoke('check-autoregistro-alerts', {
            body: { entryId: newEntry.id },
          });
        }
      } catch (alertError) {
        console.warn('[autoregistro] Alert check failed (non-blocking):', alertError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-autoregistro-entries', token] });
    },
  });

  return {
    ...query,
    entries: entriesQuery.data ?? [],
    entriesLoading: entriesQuery.isLoading,
    feedbackEnabled: query.data?.template.patient_feedback_enabled ?? false,
    submitEntry,
  };
}

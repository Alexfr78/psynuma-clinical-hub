import { useQuery, useMutation } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';

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
    fields: any[];
  };
}

export function usePublicAutoregistro(token: string) {
  const client = getAnonClient(token);

  const query = useQuery({
    queryKey: ['public-autoregistro', token],
    queryFn: async (): Promise<PublicAutoregistroData> => {
      // Fetch link
      const { data: link, error: linkError } = await client
        .from('autoregistro_links')
        .select('id, template_id, status, allow_multiple, expires_at, patient_id, center_id')
        .eq('access_token', token)
        .eq('status', 'active')
        .single();
      if (linkError || !link) throw new Error('Enlace no válido o expirado');

      // Check expiry
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        throw new Error('Este enlace ha expirado');
      }

      // Fetch template
      const { data: template, error: tError } = await client
        .from('autoregistro_templates')
        .select('id, name, description, fields')
        .eq('id', link.template_id)
        .single();
      if (tError || !template) throw new Error('Plantilla no encontrada');

      return {
        link: { id: link.id, template_id: link.template_id, status: link.status, allow_multiple: link.allow_multiple, expires_at: link.expires_at },
        template: {
          ...template,
          fields: typeof template.fields === 'string' ? JSON.parse(template.fields) : template.fields,
        },
      };
    },
    enabled: !!token,
    retry: false,
  });

  const submitEntry = useMutation({
    mutationFn: async (values: Record<string, any>) => {
      if (!query.data) throw new Error('No data loaded');
      const link = query.data.link;

      // Re-fetch link to get patient_id and center_id
      const { data: fullLink, error: flError } = await client
        .from('autoregistro_links')
        .select('patient_id, center_id, template_id')
        .eq('access_token', token)
        .single();
      if (flError || !fullLink) throw new Error('Error al enviar');

      const { error } = await client
        .from('autoregistro_entries')
        .insert({
          link_id: link.id,
          center_id: fullLink.center_id,
          patient_id: fullLink.patient_id,
          template_id: fullLink.template_id,
          values: values as any,
        });
      if (error) throw error;
    },
  });

  return { ...query, submitEntry };
}

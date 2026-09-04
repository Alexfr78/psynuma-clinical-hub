import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { VerificationCheckboxItem } from '@/lib/consent-checkboxes';
import type { Json } from '@/integrations/supabase/types';

export interface ConsentTemplate {
  id: string;
  center_id: string;
  name: string;
  content_html: string;
  requires_guardian_signature: boolean;
  requires_emergency_contact: boolean;
  is_active: boolean;
  // Raw jsonb as stored in the DB: either the legacy `string[]` format or the
  // new `{ key, label, required }[]` format. Always run it through
  // `normalizeVerificationCheckboxes()` (src/lib/consent-checkboxes.ts)
  // before using it — never assume the new shape directly.
  verification_checkboxes: (string | VerificationCheckboxItem)[];
  created_at: string;
  updated_at: string;
}

export function useConsentTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const templatesQueryKey = ['consent-templates', profile?.center_id];

  const { data: templates = [], isLoading } = useQuery({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      if (!profile?.center_id) return [];
      
      const { data, error } = await supabase
        .from('consent_templates')
        .select('*')
        .eq('center_id', profile.center_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ConsentTemplate[];
    },
    enabled: !!profile?.center_id,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Omit<ConsentTemplate, 'id' | 'center_id' | 'created_at' | 'updated_at'>) => {
      if (!profile?.center_id) throw new Error('No center');
      
      const { data, error } = await supabase
        .from('consent_templates')
        .insert({
          ...template,
          verification_checkboxes: template.verification_checkboxes as unknown as Json,
          center_id: profile.center_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      toast.success('Plantilla creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la plantilla');
      console.error(error);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, verification_checkboxes, ...updates }: Partial<ConsentTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('consent_templates')
        .update({
          ...updates,
          ...(verification_checkboxes !== undefined
            ? { verification_checkboxes: verification_checkboxes as unknown as Json }
            : {}),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: templatesQueryKey });
      const previousTemplates = queryClient.getQueryData<ConsentTemplate[]>(templatesQueryKey);
      queryClient.setQueryData<ConsentTemplate[]>(templatesQueryKey, (old) =>
        old?.map((t) => (t.id === variables.id ? { ...t, ...variables } : t))
      );
      return { previousTemplates };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      toast.success('Plantilla actualizada');
    },
    onError: (error, _variables, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(templatesQueryKey, context.previousTemplates);
      }
      toast.error('Error al actualizar la plantilla');
      console.error(error);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('consent_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      toast.success('Plantilla eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar la plantilla');
      console.error(error);
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

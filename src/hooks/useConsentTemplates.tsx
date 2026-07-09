import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ConsentTemplate {
  id: string;
  center_id: string;
  name: string;
  content_html: string;
  requires_guardian_signature: boolean;
  requires_emergency_contact: boolean;
  is_active: boolean;
  verification_checkboxes: string[];
  created_at: string;
  updated_at: string;
}

export function useConsentTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['consent-templates', profile?.center_id],
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
    mutationFn: async ({ id, ...updates }: Partial<ConsentTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('consent_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      toast.success('Plantilla actualizada');
    },
    onError: (error) => {
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AssessmentTemplate {
  id: string;
  center_id: string;
  code: string;
  name: string;
  description: string | null;
  version: number;
  items: { index: number; text: string }[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  instructions: string | null;
  interpretations: Record<string, { interpretation: string; intervention: string }> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useAssessmentTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['assessment-templates', profile?.center_id],
    queryFn: async () => {
      if (!profile?.center_id) return [];

      const { data, error } = await supabase
        .from('assessment_templates')
        .select('*')
        .eq('center_id', profile.center_id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as unknown as AssessmentTemplate[];
    },
    enabled: !!profile?.center_id,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Omit<AssessmentTemplate, 'id' | 'center_id' | 'created_at' | 'updated_at'>) => {
      if (!profile?.center_id) throw new Error('No center');

      const { data, error } = await supabase
        .from('assessment_templates')
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
      queryClient.invalidateQueries({ queryKey: ['assessment-templates'] });
      toast.success('Plantilla creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la plantilla');
      console.error(error);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AssessmentTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('assessment_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-templates'] });
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
        .from('assessment_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-templates'] });
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

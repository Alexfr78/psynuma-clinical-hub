import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';

export interface AutoregistroField {
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'checkbox' | 'scale';
  options?: string[];
  required: boolean;
  order: number;
  showInChart?: boolean;
  // Select: allow free-text "Other" option
  allowCustomValue?: boolean;
  customValueLabel?: string;
  customValuePlaceholder?: string;
  // Scale: configurable range
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface AutoregistroTemplate {
  id: string;
  center_id: string;
  professional_id: string;
  name: string;
  description: string | null;
  fields: AutoregistroField[];
  is_active: boolean;
  patient_feedback_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function useAutoregistroTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const query = useQuery({
    queryKey: ['autoregistro-templates', centerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autoregistro_templates')
        .select('*')
        .eq('center_id', centerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        fields: normalizeAutoregistroFields(
          (typeof t.fields === 'string' ? JSON.parse(t.fields) : t.fields) as AutoregistroField[]
        ),
      })) as AutoregistroTemplate[];
    },
    enabled: !!centerId,
  });

  const createTemplate = useMutation({
    mutationFn: async (input: { name: string; description?: string; fields: AutoregistroField[]; patient_feedback_enabled?: boolean }) => {
      const { data, error } = await supabase
        .from('autoregistro_templates')
        .insert({
          center_id: centerId!,
          professional_id: profile!.id,
          name: input.name,
          description: input.description || null,
          fields: normalizeAutoregistroFields(input.fields) as any,
          patient_feedback_enabled: input.patient_feedback_enabled ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-templates'] });
      toast.success('Plantilla creada');
    },
    onError: () => toast.error('Error al crear plantilla'),
  });

  const updateTemplate = useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string; fields?: AutoregistroField[]; is_active?: boolean; patient_feedback_enabled?: boolean }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.fields !== undefined) updates.fields = normalizeAutoregistroFields(input.fields);
      if (input.is_active !== undefined) updates.is_active = input.is_active;
      if (input.patient_feedback_enabled !== undefined) updates.patient_feedback_enabled = input.patient_feedback_enabled;
      const { error } = await supabase.from('autoregistro_templates').update(updates).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-templates'] });
      toast.success('Plantilla actualizada');
    },
    onError: () => toast.error('Error al actualizar plantilla'),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('autoregistro_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-templates'] });
      toast.success('Plantilla eliminada');
    },
    onError: () => toast.error('Error al eliminar plantilla'),
  });

  return { ...query, createTemplate, updateTemplate, deleteTemplate };
}

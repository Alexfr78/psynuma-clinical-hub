import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';

export interface EmotionOption {
  label: string;
  imageUrl: string;
  value?: string;
}

export interface AutoregistroField {
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'checkbox' | 'scale' | 'emotion_cards';
  options?: string[];
  required: boolean;
  order: number;
  showInChart?: boolean;
  /** If patient feedback is enabled, controls whether this field is shown to the patient in "mis registros". */
  patientVisible?: boolean;
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
  // Emotion cards
  emotionOptions?: EmotionOption[];
  allowDeselect?: boolean;
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
  patient_feedback_show_date?: boolean;
  created_at: string;
  updated_at: string;
}

export function useAutoregistroTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const isMissingColumnError = (err: any, columnName: string) => {
    const msg = String(err?.message || '').toLowerCase();
    const details = String(err?.details || '').toLowerCase();
    const hint = String(err?.hint || '').toLowerCase();
    return (
      (err?.code === '42703' || msg.includes('column') || details.includes('column') || hint.includes('column')) &&
      (msg.includes(columnName.toLowerCase()) || details.includes(columnName.toLowerCase()) || hint.includes(columnName.toLowerCase()))
    );
  };

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
    mutationFn: async (input: { name: string; description?: string; fields: AutoregistroField[]; patient_feedback_enabled?: boolean; patient_feedback_show_date?: boolean }) => {
      const insertBase: any = {
        center_id: centerId!,
        professional_id: profile!.id,
        name: input.name,
        description: input.description || null,
        fields: normalizeAutoregistroFields(input.fields) as any,
        patient_feedback_enabled: input.patient_feedback_enabled ?? false,
        patient_feedback_show_date: input.patient_feedback_show_date ?? true,
      };

      const { data, error } = await supabase
        .from('autoregistro_templates')
        .insert(insertBase)
        .select()
        .single();

      if (!error) return data;

      // Backwards-compat: DB may not have the new column yet
      if (isMissingColumnError(error, 'patient_feedback_show_date')) {
        const { data: data2, error: error2 } = await supabase
          .from('autoregistro_templates')
          .insert({ ...insertBase, patient_feedback_show_date: undefined })
          .select()
          .single();
        if (error2) throw error2;
        return data2;
      }

      throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoregistro-templates'] });
      toast.success('Plantilla creada');
    },
    onError: () => toast.error('Error al crear plantilla'),
  });

  const updateTemplate = useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string; fields?: AutoregistroField[]; is_active?: boolean; patient_feedback_enabled?: boolean; patient_feedback_show_date?: boolean }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.fields !== undefined) updates.fields = normalizeAutoregistroFields(input.fields);
      if (input.is_active !== undefined) updates.is_active = input.is_active;
      if (input.patient_feedback_enabled !== undefined) updates.patient_feedback_enabled = input.patient_feedback_enabled;
      if (input.patient_feedback_show_date !== undefined) updates.patient_feedback_show_date = input.patient_feedback_show_date;

      const { error } = await supabase.from('autoregistro_templates').update(updates).eq('id', input.id);
      if (!error) return;

      // Backwards-compat: DB may not have the new column yet
      if (isMissingColumnError(error, 'patient_feedback_show_date')) {
        const { patient_feedback_show_date, ...updates2 } = updates;
        const { error: error2 } = await supabase.from('autoregistro_templates').update(updates2).eq('id', input.id);
        if (error2) throw error2;
        return;
      }

      throw error;
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

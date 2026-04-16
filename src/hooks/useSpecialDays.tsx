import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  getSpecialDayErrorMessage,
  type SpecialDay,
  type SpecialDaySlot,
} from '@/lib/special-days';

type SpecialDayInput = Omit<
  SpecialDay,
  'id' | 'created_at' | 'updated_at' | 'special_day_slots'
> & {
  slots: Pick<SpecialDaySlot, 'start_time' | 'end_time'>[];
};

export function useSpecialDays(centerId?: string) {
  return useQuery({
    queryKey: ['special-days', centerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('special_days')
        .select('*, special_day_slots(id, start_time, end_time)')
        .eq('center_id', centerId!)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data || []) as SpecialDay[];
    },
    enabled: !!centerId,
  });
}

async function replaceSlots(specialDayId: string, slots: SpecialDayInput['slots']) {
  const { error: delErr } = await supabase
    .from('special_day_slots')
    .delete()
    .eq('special_day_id', specialDayId);
  if (delErr) throw delErr;

  if (slots.length === 0) return;

  const rows = slots.map((s) => ({
    special_day_id: specialDayId,
    start_time: s.start_time,
    end_time: s.end_time,
  }));
  const { error: insErr } = await supabase.from('special_day_slots').insert(rows);
  if (insErr) throw insErr;
}

export function useCreateSpecialDay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: SpecialDayInput) => {
      const { slots, ...head } = input;
      const { data, error } = await supabase
        .from('special_days')
        .insert(head as any)
        .select()
        .single();
      if (error) throw error;

      if (head.type !== 'closed' && slots.length > 0) {
        await replaceSlots(data.id, slots);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-days'] });
      toast({ title: 'Día especial creado' });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Error',
        description: getSpecialDayErrorMessage(err, 'No se pudo crear el día especial.'),
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateSpecialDay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: SpecialDayInput & { id: string }) => {
      const { slots, ...head } = input;
      const { data, error } = await supabase
        .from('special_days')
        .update(head as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await replaceSlots(id, head.type === 'closed' ? [] : slots);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-days'] });
      toast({ title: 'Día especial actualizado' });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Error',
        description: getSpecialDayErrorMessage(err, 'No se pudo actualizar el día especial.'),
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteSpecialDay() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('special_days').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-days'] });
      toast({ title: 'Día especial eliminado' });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Error',
        description: getSpecialDayErrorMessage(err, 'No se pudo eliminar el día especial.'),
        variant: 'destructive',
      });
    },
  });
}

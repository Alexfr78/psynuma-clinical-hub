import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LocationSchedule {
  id: string;
  location_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_open: boolean | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleUpsert {
  id?: string;
  location_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_open: boolean;
  is_default?: boolean;
}

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

export function useLocationSchedules(locationId: string | undefined) {
  return useQuery({
    queryKey: ['location-schedules', locationId],
    queryFn: async () => {
      if (!locationId) return [];
      
      const { data, error } = await supabase
        .from('location_schedules')
        .select('*')
        .eq('location_id', locationId)
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      return data as LocationSchedule[];
    },
    enabled: !!locationId,
  });
}

export function useAllLocationSchedules(locationIds: string[]) {
  return useQuery({
    queryKey: ['location-schedules', 'all', locationIds],
    queryFn: async () => {
      if (locationIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('location_schedules')
        .select('*')
        .in('location_id', locationIds)
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      return data as LocationSchedule[];
    },
    enabled: locationIds.length > 0,
  });
}

export function useUpsertLocationSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (schedule: ScheduleUpsert) => {
      const { data, error } = await supabase
        .from('location_schedules')
        .upsert(schedule, { onConflict: 'location_id,day_of_week' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['location-schedules', variables.location_id] });
      queryClient.invalidateQueries({ queryKey: ['location-schedules', 'all'] });
    },
  });
}

export function useInitializeLocationSchedules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationId: string) => {
      // Create default schedules for all days (Mon-Fri open, Sat-Sun closed)
      const defaultSchedules: ScheduleUpsert[] = DAYS_OF_WEEK.map(day => ({
        location_id: locationId,
        day_of_week: day,
        start_time: '09:00',
        end_time: '21:00',
        is_open: day >= 1 && day <= 5, // Mon-Fri open
      }));

      const { data, error } = await supabase
        .from('location_schedules')
        .upsert(defaultSchedules, { onConflict: 'location_id,day_of_week' })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, locationId) => {
      queryClient.invalidateQueries({ queryKey: ['location-schedules', locationId] });
      queryClient.invalidateQueries({ queryKey: ['location-schedules', 'all'] });
    },
  });
}

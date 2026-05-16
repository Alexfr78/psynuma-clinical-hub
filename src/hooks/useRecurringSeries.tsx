import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { toast } from 'sonner';
import { RecurringSeries, RecurringSeriesInsert, RecurringSeriesUpdate, EditScope, RecurrenceConfig } from '@/types/recurring';
import { generateRecurrenceOccurrences } from '@/lib/recurrence-utils';
import { format } from 'date-fns';

interface CreateRecurringSeriesParams {
  seriesData: Omit<RecurringSeriesInsert, 'center_id' | 'created_by'>;
  occurrences: Date[];
  sessionTypeId?: string;
}

interface UpdateRecurringSessionParams {
  sessionId: string;
  updates: Record<string, unknown>;
  scope: EditScope;
  seriesId: string;
  occurrenceIndex: number;
}

interface CancelRecurringSessionParams {
  sessionId: string;
  scope: EditScope;
  seriesId: string;
  occurrenceIndex: number;
}

export function useRecurringSeries(seriesId?: string) {
  const { center } = useCenter();

  return useQuery({
    queryKey: ['recurring-series', seriesId],
    queryFn: async () => {
      if (!seriesId) return null;
      
      const { data, error } = await supabase
        .from('recurring_series')
        .select('*')
        .eq('id', seriesId)
        .single();
      
      if (error) throw error;
      return data as unknown as RecurringSeries;
    },
    enabled: !!seriesId && !!center?.id,
  });
}

export function useCreateRecurringSeries() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async ({ seriesData, occurrences, sessionTypeId }: CreateRecurringSeriesParams) => {
      if (!center?.id || !user?.id) {
        throw new Error('No hay centro o usuario autenticado');
      }

      // 1. Create the recurring series
      const seriesPayload = {
        ...seriesData,
        center_id: center.id,
        created_by: user.id,
        last_generated_until: occurrences.length > 0 
          ? format(occurrences[occurrences.length - 1], 'yyyy-MM-dd')
          : null,
      };

      const { data: series, error: seriesError } = await supabase
        .from('recurring_series')
        .insert(seriesPayload as any)
        .select()
        .single();

      if (seriesError) throw seriesError;

      // 2. Create sessions for each occurrence
      const sessionsToCreate = occurrences.map((date, index) => ({
        center_id: center.id,
        patient_id: seriesData.patient_id,
        professional_id: seriesData.professional_id,
        session_date: format(date, 'yyyy-MM-dd'),
        start_time: format(date, 'HH:mm:ss'),
        end_time: format(new Date(date.getTime() + seriesData.duration_minutes * 60000), 'HH:mm:ss'),
        session_type: seriesData.session_type,
        ...(sessionTypeId ? { session_type_id: sessionTypeId } : {}),
        price: seriesData.price,
        session_modality: seriesData.session_modality,
        location_id: seriesData.location_id,
        notes: seriesData.notes_default,
        bono_id: seriesData.bono_id,
        status: 'scheduled' as const,
        recurring_series_id: series.id,
        occurrence_index: index + 1,
        is_exception: false,
      }));

      if (sessionsToCreate.length > 0) {
        const { error: sessionsError } = await supabase
          .from('sessions')
          .insert(sessionsToCreate as any);

        if (sessionsError) throw sessionsError;
      }

      return {
        seriesId: series.id,
        createdCount: sessionsToCreate.length,
      };
    },
    onSuccess: ({ createdCount }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-series'] });
      toast.success(`Se han creado ${createdCount} citas recurrentes`);
    },
    onError: (error) => {
      console.error('Error creating recurring series:', error);
      toast.error('Error al crear la serie recurrente');
    },
  });
}

export function useUpdateRecurringSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, updates, scope, seriesId, occurrenceIndex }: UpdateRecurringSessionParams) => {
      switch (scope) {
        case 'this': {
          // Update only this session, mark as exception
          const currentSession = await supabase
            .from('sessions')
            .select('session_date, start_time')
            .eq('id', sessionId)
            .single();

          const originalDatetime = currentSession.data 
            ? `${currentSession.data.session_date}T${currentSession.data.start_time}`
            : null;

          const { error } = await supabase
            .from('sessions')
            .update({
              ...updates,
              is_exception: true,
              original_start_datetime: originalDatetime,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);

          if (error) throw error;
          return { updated: 1 };
        }

        case 'all': {
          // Update series defaults and all non-exception future sessions
          const { error: seriesError } = await supabase
            .from('recurring_series')
            .update({
              session_type: updates.session_type,
              price: updates.price,
              session_modality: updates.session_modality,
              location_id: updates.location_id,
              notes_default: updates.notes,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('id', seriesId);

          if (seriesError) throw seriesError;

          // Update all future non-exception sessions
          const today = format(new Date(), 'yyyy-MM-dd');
          const { data: updated, error: sessionsError } = await supabase
            .from('sessions')
            .update({
              session_type: updates.session_type as string,
              price: updates.price as number,
              session_modality: updates.session_modality as string,
              location_id: updates.location_id as string,
              notes: updates.notes as string,
              updated_at: new Date().toISOString(),
            })
            .eq('recurring_series_id', seriesId)
            .eq('is_exception', false)
            .gte('session_date', today)
            .select();

          if (sessionsError) throw sessionsError;
          return { updated: updated?.length || 0 };
        }

        case 'this_and_following': {
          // This is the most complex case - need to split the series
          // 1. Get the current session's date
          const { data: currentSession } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

          if (!currentSession) throw new Error('Sesión no encontrada');

          // 2. Get the series
          const { data: series } = await supabase
            .from('recurring_series')
            .select('*')
            .eq('id', seriesId)
            .single();

          if (!series) throw new Error('Serie no encontrada');

          // 3. Close the original series by setting until_date to day before current
          const prevDate = new Date(currentSession.session_date);
          prevDate.setDate(prevDate.getDate() - 1);
          
          const updatedRrule = {
            ...(series.rrule_json as unknown as RecurrenceConfig),
            end_type: 'until_date' as const,
            until_date: format(prevDate, 'yyyy-MM-dd'),
          };

          await supabase
            .from('recurring_series')
            .update({
              rrule_json: updatedRrule as any,
              updated_at: new Date().toISOString(),
            })
            .eq('id', seriesId);

          // 4. Update this and all following sessions with new values
          const { data: updatedSessions, error: updateError } = await supabase
            .from('sessions')
            .update({
              ...updates,
              recurring_series_id: null, // Detach from old series
              is_exception: false,
              updated_at: new Date().toISOString(),
            })
            .eq('recurring_series_id', seriesId)
            .gte('occurrence_index', occurrenceIndex)
            .select();

          if (updateError) throw updateError;

          return { updated: updatedSessions?.length || 0 };
        }

        default:
          throw new Error('Alcance no válido');
      }
    },
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-series'] });
      toast.success(`Se han actualizado ${updated} cita${updated !== 1 ? 's' : ''}`);
    },
    onError: (error) => {
      console.error('Error updating recurring session:', error);
      toast.error('Error al actualizar la cita');
    },
  });
}

export function useCancelRecurringSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, scope, seriesId, occurrenceIndex }: CancelRecurringSessionParams) => {
      switch (scope) {
        case 'this': {
          // Cancel only this session
          const { error } = await supabase
            .from('sessions')
            .update({
              status: 'cancelled',
              is_exception: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);

          if (error) throw error;
          return { cancelled: 1 };
        }

        case 'all': {
          // Deactivate series and cancel all future sessions
          await supabase
            .from('recurring_series')
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', seriesId);

          const today = format(new Date(), 'yyyy-MM-dd');
          const { data: cancelled, error } = await supabase
            .from('sessions')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('recurring_series_id', seriesId)
            .gte('session_date', today)
            .neq('status', 'completed')
            .select();

          if (error) throw error;
          return { cancelled: cancelled?.length || 0 };
        }

        case 'this_and_following': {
          // Cancel this and all following sessions
          const today = format(new Date(), 'yyyy-MM-dd');
          
          // Update series to end before this occurrence
          const { data: currentSession } = await supabase
            .from('sessions')
            .select('session_date')
            .eq('id', sessionId)
            .single();

          if (currentSession) {
            const prevDate = new Date(currentSession.session_date);
            prevDate.setDate(prevDate.getDate() - 1);

            const { data: series } = await supabase
              .from('recurring_series')
              .select('rrule_json')
              .eq('id', seriesId)
              .single();

            if (series) {
              const updatedRrule = {
                ...(series.rrule_json as unknown as RecurrenceConfig),
                end_type: 'until_date' as const,
                until_date: format(prevDate, 'yyyy-MM-dd'),
              };

              await supabase
                .from('recurring_series')
                .update({
                  rrule_json: updatedRrule as any,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', seriesId);
            }
          }

          // Cancel all sessions from this occurrence onwards
          const { data: cancelled, error } = await supabase
            .from('sessions')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('recurring_series_id', seriesId)
            .gte('occurrence_index', occurrenceIndex)
            .neq('status', 'completed')
            .select();

          if (error) throw error;
          return { cancelled: cancelled?.length || 0 };
        }

        default:
          throw new Error('Alcance no válido');
      }
    },
    onSuccess: ({ cancelled }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-series'] });
      toast.success(`Se han cancelado ${cancelled} cita${cancelled !== 1 ? 's' : ''}`);
    },
    onError: (error) => {
      console.error('Error cancelling recurring session:', error);
      toast.error('Error al cancelar la cita');
    },
  });
}

/**
 * Hook to ensure occurrences are generated for a date range
 * Called when viewing agenda to generate incremental occurrences
 */
export function useEnsureOccurrences() {
  const queryClient = useQueryClient();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async (rangeEndDate: Date) => {
      if (!center?.id) return { generated: 0 };

      // Get active series that need more occurrences
      const { data: activeSeries, error: seriesError } = await supabase
        .from('recurring_series')
        .select('*')
        .eq('center_id', center.id)
        .eq('is_active', true);

      if (seriesError) throw seriesError;
      if (!activeSeries || activeSeries.length === 0) return { generated: 0 };

      let totalGenerated = 0;

      for (const series of activeSeries) {
        const lastGenerated = series.last_generated_until 
          ? new Date(series.last_generated_until)
          : new Date(series.base_start_datetime);

        // If we've already generated up to or past the range end, skip
        if (lastGenerated >= rangeEndDate) continue;

        const config = series.rrule_json as unknown as RecurrenceConfig;
        
        // Generate from day after last generated
        const startFrom = new Date(lastGenerated);
        startFrom.setDate(startFrom.getDate() + 1);
        startFrom.setHours(
          new Date(series.base_start_datetime).getHours(),
          new Date(series.base_start_datetime).getMinutes(),
          0, 0
        );

        // Check remaining occurrences allowed
        const { count: existingCount } = await supabase
          .from('sessions')
          .select('id', { count: 'exact' })
          .eq('recurring_series_id', series.id);

        const remainingAllowed = (series.max_occurrences || 50) - (existingCount || 0);
        if (remainingAllowed <= 0) continue;

        // Generate new occurrences
        const maxDaysFromNow = Math.ceil((rangeEndDate.getTime() - startFrom.getTime()) / (1000 * 60 * 60 * 24)) + 7;
        const newOccurrences = generateRecurrenceOccurrences(
          config,
          startFrom,
          remainingAllowed,
          maxDaysFromNow
        ).filter(d => d <= rangeEndDate);

        if (newOccurrences.length === 0) continue;

        // Get last occurrence index
        const { data: lastSession } = await supabase
          .from('sessions')
          .select('occurrence_index')
          .eq('recurring_series_id', series.id)
          .order('occurrence_index', { ascending: false })
          .limit(1)
          .single();

        const lastIndex = lastSession?.occurrence_index || 0;

        // Create new sessions
        const sessionsToCreate = newOccurrences.map((date, idx) => ({
          center_id: center.id,
          patient_id: series.patient_id,
          professional_id: series.professional_id,
          session_date: format(date, 'yyyy-MM-dd'),
          start_time: format(date, 'HH:mm:ss'),
          end_time: format(new Date(date.getTime() + series.duration_minutes * 60000), 'HH:mm:ss'),
          session_type: series.session_type,
          price: series.price,
          session_modality: series.session_modality,
          location_id: series.location_id,
          notes: series.notes_default,
          bono_id: series.bono_id,
          status: 'scheduled' as const,
          recurring_series_id: series.id,
          occurrence_index: lastIndex + idx + 1,
          is_exception: false,
        }));

        const { error: insertError } = await supabase
          .from('sessions')
          .insert(sessionsToCreate as any);

        if (!insertError) {
          totalGenerated += sessionsToCreate.length;

          // Update last_generated_until
          await supabase
            .from('recurring_series')
            .update({
              last_generated_until: format(newOccurrences[newOccurrences.length - 1], 'yyyy-MM-dd'),
            })
            .eq('id', series.id);
        }
      }

      return { generated: totalGenerated };
    },
    onSuccess: ({ generated }) => {
      if (generated > 0) {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }
    },
  });
}

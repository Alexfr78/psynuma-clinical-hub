import { qk } from '@/lib/query-keys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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

interface CreatedRecurringSession {
  id: string;
  session_date: string;
  start_time: string;
}

interface RecurringBonoApplicationResult {
  requested: number;
  applied: number;
  notApplied: number;
  failed: number;
  exhausted: boolean;
  errors: string[];
}

const EXHAUSTED_BONO_MESSAGES = [
  'Bono sin sesiones disponibles',
  'Bono no está activo',
  'Bono no esta activo',
];

async function applyBonoToCreatedSessions(
  bonoId: string | null | undefined,
  sessions: CreatedRecurringSession[]
): Promise<RecurringBonoApplicationResult | null> {
  if (!bonoId || sessions.length === 0) return null;

  const orderedSessions = [...sessions].sort((a, b) => {
    const aDate = `${a.session_date}T${a.start_time}`;
    const bDate = `${b.session_date}T${b.start_time}`;
    return aDate.localeCompare(bDate);
  });

  const result: RecurringBonoApplicationResult = {
    requested: orderedSessions.length,
    applied: 0,
    notApplied: 0,
    failed: 0,
    exhausted: false,
    errors: [],
  };

  const { data: bono, error: bonoError } = await supabase
    .from('bonos')
    .select('total_sessions, used_sessions, status')
    .eq('id', bonoId)
    .single();

  if (bonoError || !bono) {
    result.notApplied = orderedSessions.length;
    result.failed = orderedSessions.length;
    result.errors.push(bonoError?.message || 'Bono no encontrado');
    return result;
  }

  let remaining = bono.status === 'active'
    ? Math.max((bono.total_sessions || 0) - (bono.used_sessions || 0), 0)
    : 0;

  if (remaining <= 0) {
    result.notApplied = orderedSessions.length;
    result.exhausted = true;
    return result;
  }

  for (const session of orderedSessions) {
    if (remaining <= 0) {
      result.exhausted = true;
      break;
    }

    const { error } = await supabase.rpc('apply_bono_to_session', {
      p_bono_id: bonoId,
      p_session_id: session.id,
    });

    if (!error) {
      result.applied += 1;
      remaining -= 1;
      continue;
    }

    if (EXHAUSTED_BONO_MESSAGES.some((message) => error.message.includes(message))) {
      result.exhausted = true;
      break;
    }

    result.failed += 1;
    result.errors.push(error.message);
  }

  result.notApplied = orderedSessions.length - result.applied;
  return result;
}

export function useRecurringSeries(seriesId?: string) {
  const { center } = useCenter();

  return useQuery({
    queryKey: qk.recurringSeries.bySeries(seriesId),
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
        rrule_json: seriesData.rrule_json as unknown as Json,
        last_generated_until: occurrences.length > 0
          ? format(occurrences[occurrences.length - 1], 'yyyy-MM-dd')
          : null,
      };

      const { data: series, error: seriesError } = await supabase
        .from('recurring_series')
        .insert(seriesPayload)
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
        // Sin bono_id: lo pone apply_bono_to_session solo en las que quepan
        status: 'scheduled' as const,
        recurring_series_id: series.id,
        occurrence_index: index + 1,
        is_exception: false,
      }));

      let createdSessions: CreatedRecurringSession[] = [];

      if (sessionsToCreate.length > 0) {
        const { data, error: sessionsError } = await supabase
          .from('sessions')
          .insert(sessionsToCreate)
          .select('id, session_date, start_time');

        if (sessionsError) throw sessionsError;
        createdSessions = data || [];
      }

      const bonoApplication = await applyBonoToCreatedSessions(seriesData.bono_id, createdSessions);

      return {
        seriesId: series.id,
        createdCount: sessionsToCreate.length,
        bonoApplication,
      };
    },
    onSuccess: ({ createdCount, bonoApplication }) => {
      queryClient.invalidateQueries({ queryKey: qk.sessions.all });
      queryClient.invalidateQueries({ queryKey: qk.recurringSeries.all });
      if (bonoApplication) {
        queryClient.invalidateQueries({ queryKey: qk.bonos.all });
        queryClient.invalidateQueries({ queryKey: qk.bonoSessions.all });
        queryClient.invalidateQueries({ queryKey: qk.debts.all });
        queryClient.invalidateQueries({ queryKey: qk.patientActiveBonos.all });
      }
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
              session_type: updates.session_type as string | null,
              price: updates.price as number,
              session_modality: updates.session_modality as string | null,
              location_id: updates.location_id as string | null,
              notes_default: updates.notes as string | null,
              updated_at: new Date().toISOString(),
            })
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
              rrule_json: updatedRrule,
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
      queryClient.invalidateQueries({ queryKey: qk.sessions.all });
      queryClient.invalidateQueries({ queryKey: qk.recurringSeries.all });
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
          const { data, error } = await supabase
            .from('sessions')
            .update({
              status: 'cancelled',
              cancellation_origin: 'professional',
              cancellation_reason: 'Cancelación recurrente registrada por el profesional',
              is_exception: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId)
            .select('id')
            .single();

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
              cancellation_origin: 'professional',
              cancellation_reason: 'Cancelación recurrente registrada por el profesional',
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
                  rrule_json: updatedRrule,
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
              cancellation_origin: 'professional',
              cancellation_reason: 'Cancelación recurrente registrada por el profesional',
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
      queryClient.invalidateQueries({ queryKey: qk.sessions.all });
      queryClient.invalidateQueries({ queryKey: qk.recurringSeries.all });
      queryClient.invalidateQueries({ queryKey: qk.cancellationCharges.all });
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
          .select('occurrence_index, session_type_id')
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
          session_type_id: lastSession?.session_type_id ?? null,
          price: series.price,
          session_modality: series.session_modality,
          location_id: series.location_id,
          notes: series.notes_default,
          status: 'scheduled' as const,
          recurring_series_id: series.id,
          occurrence_index: lastIndex + idx + 1,
          is_exception: false,
        }));

        const { data: createdSessions, error: insertError } = await supabase
          .from('sessions')
          .insert(sessionsToCreate)
          .select('id, session_date, start_time');

        if (!insertError) {
          totalGenerated += sessionsToCreate.length;

          await applyBonoToCreatedSessions(series.bono_id, createdSessions || []);

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
        queryClient.invalidateQueries({ queryKey: qk.sessions.all });
      }
    },
  });
}

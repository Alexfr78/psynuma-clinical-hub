/**
 * Bandeja de revisión de grabaciones Plaud.
 *
 * `plaud_recordings` todavía no existe en `src/integrations/supabase/types.ts` (otro agente
 * está creando la tabla en Supabase). Para no bloquear este trabajo se amplía el tipo
 * `Database` generado con la forma de esa tabla, documentada en el encargo, y se usa esa
 * versión ampliada solo para las consultas de este archivo.
 *
 * QUITAR ESTO CUANDO SE REGENEREN LOS TIPOS: en cuanto `npx supabase gen types` incluya
 * `plaud_recordings`, borra el bloque "Augmented Database" de abajo y sustituye
 * `plaudClient` por el `supabase` normal en las funciones de este archivo — si los nombres
 * de columnas coinciden con los de aquí, no hace falta tocar nada más.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';

// ---------------------------------------------------------------------------
// Augmented Database (temporal, ver cabecera del archivo)
// ---------------------------------------------------------------------------

export type PlaudRecordingStatus =
  | 'pending'
  | 'matched'
  | 'needs_review'
  | 'ignored'
  | 'processed'
  | 'error';

export type PlaudMatchedBy = 'auto' | 'manual';

export interface PlaudRecordingRow {
  id: string;
  center_id: string;
  plaud_file_id: string;
  start_at: string;
  duration_ms: number;
  serial_number: string | null;
  status: PlaudRecordingStatus;
  contains_multiple_sessions: boolean;
  segmentation_score: number | null;
  segmentation_signals: Json | null;
  segment_boundaries: Json | null;
  overlap_flag: boolean;
  overlap_with_file_id: string | null;
  session_id: string | null;
  patient_id: string | null;
  match_confidence: number | null;
  match_reasons: Json | null;
  matched_by: PlaudMatchedBy | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  transcript_text: string | null;
  transcript_fetched_at: string | null;
  transcript_expires_at: string | null;
  report_generated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

type PlaudRecordingUpdate = Partial<PlaudRecordingRow>;

/** Los tipos generados ya incluyen `plaud_recordings`: se usa el cliente normal. */
const plaudClient = supabase;


// ---------------------------------------------------------------------------
// Datos combinados para presentación
// ---------------------------------------------------------------------------

export interface PlaudSessionRef {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
}

export interface PlaudOverlapRef {
  id: string;
  start_at: string;
  duration_ms: number;
}

export interface PlaudConfirmedByRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface PlaudRecordingWithContext extends PlaudRecordingRow {
  suggestedSession: PlaudSessionRef | null;
  overlapRecording: PlaudOverlapRef | null;
  confirmedByProfile: PlaudConfirmedByRef | null;
}

const RESOLVED_STATUSES: PlaudRecordingStatus[] = ['matched', 'ignored', 'processed'];

async function attachContext(
  recordings: PlaudRecordingRow[],
  centerId: string,
): Promise<PlaudRecordingWithContext[]> {
  if (recordings.length === 0) return [];

  const sessionIds = Array.from(new Set(recordings.map((r) => r.session_id).filter((v): v is string => !!v)));
  const overlapFileIds = Array.from(new Set(recordings.map((r) => r.overlap_with_file_id).filter((v): v is string => !!v)));
  const confirmedByIds = Array.from(new Set(recordings.map((r) => r.confirmed_by).filter((v): v is string => !!v)));

  const [sessionsRes, overlapRes, profilesRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, patient_id, patients!sessions_patient_id_fkey(first_name, last_name)')
        .in('id', sessionIds)
      : Promise.resolve({ data: [], error: null }),
    overlapFileIds.length > 0
      ? plaudClient
        .from('plaud_recordings')
        .select('id, plaud_file_id, start_at, duration_ms')
        .eq('center_id', centerId)
        .in('plaud_file_id', overlapFileIds)
      : Promise.resolve({ data: [], error: null }),
    confirmedByIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name').in('id', confirmedByIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (overlapRes.error) throw overlapRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const sessionMap = new Map<string, PlaudSessionRef>();
  for (const s of (sessionsRes.data ?? []) as Array<{
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    patient_id: string;
    patients: { first_name: string; last_name: string } | null;
  }>) {
    sessionMap.set(s.id, {
      id: s.id,
      session_date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      patient_id: s.patient_id,
      patient_first_name: s.patients?.first_name ?? '',
      patient_last_name: s.patients?.last_name ?? '',
    });
  }

  const overlapMap = new Map<string, PlaudOverlapRef>();
  for (const o of (overlapRes.data ?? []) as Array<{ id: string; plaud_file_id: string; start_at: string; duration_ms: number }>) {
    overlapMap.set(o.plaud_file_id, { id: o.id, start_at: o.start_at, duration_ms: o.duration_ms });
  }

  const profileMap = new Map<string, PlaudConfirmedByRef>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    profileMap.set(p.id, p);
  }

  return recordings.map((r) => ({
    ...r,
    suggestedSession: r.session_id ? sessionMap.get(r.session_id) ?? null : null,
    overlapRecording: r.overlap_with_file_id ? overlapMap.get(r.overlap_with_file_id) ?? null : null,
    confirmedByProfile: r.confirmed_by ? profileMap.get(r.confirmed_by) ?? null : null,
  }));
}

/**
 * Bandeja de grabaciones Plaud. `scope: 'needs_review'` trae solo las pendientes de
 * decisión humana; `scope: 'resolved'` trae el historial (emparejadas, descartadas o
 * procesadas) para consulta.
 */
export function usePlaudRecordings(scope: 'needs_review' | 'resolved', options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-recordings', scope, centerId],
    queryFn: async () => {
      if (!centerId) return [];

      let query = plaudClient
        .from('plaud_recordings')
        .select('*')
        .eq('center_id', centerId);

      query = scope === 'needs_review'
        ? query.eq('status', 'needs_review')
        : query.in('status', RESOLVED_STATUSES);

      query = scope === 'needs_review'
        ? query.order('start_at', { ascending: true })
        : query.order('confirmed_at', { ascending: false, nullsFirst: false });

      const { data, error } = await query;
      if (error) throw error;

      return attachContext((data ?? []) as PlaudRecordingRow[], centerId);
    },
    enabled: !!centerId && (options?.enabled ?? true),
  });
}

/** Cuenta rápida de pendientes, para mostrar un aviso/badge en la navegación. */
export function usePlaudNeedsReviewCount() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-recordings-count', centerId],
    queryFn: async () => {
      if (!centerId) return 0;
      const { count, error } = await plaudClient
        .from('plaud_recordings')
        .select('id', { count: 'exact', head: true })
        .eq('center_id', centerId)
        .eq('status', 'needs_review');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!centerId,
    staleTime: 60_000,
  });
}

function invalidatePlaudQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['plaud-recordings'] });
  queryClient.invalidateQueries({ queryKey: ['plaud-recordings-count'] });
}

/**
 * Confirma el emparejamiento de una grabación con una sesión y paciente concretos —
 * ya sea la sugerencia del sistema o una elegida a mano en el buscador. Siempre queda
 * registrado como `matched_by: 'manual'` porque pasó por una decisión humana, y guarda
 * quién y cuándo.
 */
export function useConfirmPlaudMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ recordingId, sessionId, patientId }: { recordingId: string; sessionId: string; patientId: string }) => {
      if (!user?.id) throw new Error('No hay usuario autenticado');

      const update: PlaudRecordingUpdate = {
        session_id: sessionId,
        patient_id: patientId,
        matched_by: 'manual',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        status: 'matched',
      };

      const { error } = await plaudClient
        .from('plaud_recordings')
        .update(update)
        .eq('id', recordingId);
      if (error) throw error;
    },
    onSuccess: () => invalidatePlaudQueries(queryClient),
  });
}

/** Descarta una grabación por no corresponder a contenido clínico (ruido, prueba, etc.). */
export function useDiscardPlaudRecording() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (recordingId: string) => {
      if (!user?.id) throw new Error('No hay usuario autenticado');

      const update: PlaudRecordingUpdate = {
        status: 'ignored',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      };

      const { error } = await plaudClient
        .from('plaud_recordings')
        .update(update)
        .eq('id', recordingId);
      if (error) throw error;
    },
    onSuccess: () => invalidatePlaudQueries(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Buscador de sesiones del centro (para "elegir otra sesión")
// ---------------------------------------------------------------------------

export interface PlaudSessionSearchResult {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
}

/**
 * Busca sesiones del centro por nombre de paciente para el selector manual de
 * "elegir otra sesión". Sin texto de búsqueda, muestra las sesiones más recientes primero
 * para que sea fácil localizar una cita cercana a la fecha de la grabación.
 */
export function usePlaudSessionSearch(search: string) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-session-search', centerId, search],
    queryFn: async () => {
      if (!centerId) return [];

      let query = supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, patient_id, patients!sessions_patient_id_fkey(first_name, last_name)')
        .eq('center_id', centerId)
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(25);

      const trimmed = search.trim();
      if (trimmed) {
        const { data: matchingPatients, error: patientsError } = await supabase
          .from('patients')
          .select('id')
          .eq('center_id', centerId)
          .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`)
          .limit(50);
        if (patientsError) throw patientsError;

        const patientIds = (matchingPatients ?? []).map((p) => p.id);
        if (patientIds.length === 0) return [];
        query = query.in('patient_id', patientIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((s) => ({
        id: s.id,
        session_date: s.session_date,
        start_time: s.start_time,
        end_time: s.end_time,
        patient_id: s.patient_id,
        patient_first_name: s.patients?.first_name ?? '',
        patient_last_name: s.patients?.last_name ?? '',
      })) as PlaudSessionSearchResult[];
    },
    enabled: !!centerId,
  });
}

export function usePlaudReviewStats(recordings: PlaudRecordingWithContext[] | undefined) {
  return useMemo(() => {
    const list = recordings ?? [];
    return {
      total: list.length,
      multiSession: list.filter((r) => r.contains_multiple_sessions).length,
      overlap: list.filter((r) => r.overlap_flag).length,
    };
  }, [recordings]);
}

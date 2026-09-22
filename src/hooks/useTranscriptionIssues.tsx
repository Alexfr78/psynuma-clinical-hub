import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ACCOUNT_BLOCKED_CODES } from '@/lib/transcription-account-errors';

/**
 * Transcripciones que necesitan atención del profesional:
 * - `blocked`: en espera por un problema de la cuenta de OpenAI (sin saldo, clave
 *   inválida o sin configurar). Se reintentan solas cada hora; basta con arreglar la cuenta.
 * - `failed`: fallaron tras todos los intentos pero el audio sigue guardado (7 días),
 *   así que se pueden reintentar a mano.
 */

const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface TranscriptionIssue {
  jobId: string;
  audioIngestionId: string;
  kind: 'blocked' | 'failed';
  errorCode: string | null;
  message: string | null;
  patientName: string | null;
  uploadedAt: string | null;
  expiresAt: string | null;
}

interface JobRow {
  id: string;
  status: string;
  error_code: string | null;
  error_message_sanitized: string | null;
  audio_ingestion: {
    id: string;
    status: string;
    patient_id: string | null;
    professional_id: string;
    uploaded_at: string | null;
    storage_path: string | null;
  } | null;
}

export function useTranscriptionIssues() {
  const { user, profile, isAdmin, isProfessional } = useAuth();
  return useQuery({
    queryKey: ['transcription-issues', profile?.center_id, user?.id, isAdmin],
    queryFn: async (): Promise<TranscriptionIssue[]> => {
      const { data, error } = await supabase
        .from('transcription_jobs')
        .select('id, status, error_code, error_message_sanitized, audio_ingestion:audio_ingestions!inner(id, status, patient_id, professional_id, uploaded_at, storage_path)')
        .or(`status.eq.failed,and(status.eq.queued,error_code.in.(${ACCOUNT_BLOCKED_CODES.join(',')}))`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      const cutoff = Date.now() - AUDIO_RETENTION_MS;
      const rows = ((data ?? []) as unknown as JobRow[]).filter((row) => {
        const ingestion = row.audio_ingestion;
        if (!ingestion?.storage_path || !ingestion.uploaded_at) return false;
        // Cada profesional ve (y puede reintentar) solo sus grabaciones; el admin, todas.
        if (!isAdmin && ingestion.professional_id !== user?.id) return false;
        if (new Date(ingestion.uploaded_at).getTime() < cutoff) return false;
        return row.status === 'queued' || ingestion.status === 'failed';
      });

      const patientIds = [...new Set(rows.map((r) => r.audio_ingestion?.patient_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (patientIds.length) {
        const { data: patients } = await supabase.from('patients').select('id, first_name, last_name').in('id', patientIds);
        for (const p of patients ?? []) names.set(p.id, `${p.first_name} ${p.last_name ?? ''}`.trim());
      }

      return rows.map((row) => {
        const uploadedAt = row.audio_ingestion?.uploaded_at ?? null;
        return {
          jobId: row.id,
          audioIngestionId: row.audio_ingestion!.id,
          kind: row.status === 'queued' ? 'blocked' : 'failed',
          errorCode: row.error_code,
          message: row.error_message_sanitized,
          patientName: row.audio_ingestion?.patient_id ? names.get(row.audio_ingestion.patient_id) ?? null : null,
          uploadedAt,
          expiresAt: uploadedAt ? new Date(new Date(uploadedAt).getTime() + AUDIO_RETENTION_MS).toISOString() : null,
        };
      });
    },
    enabled: !!profile?.center_id && (isAdmin || isProfessional),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRetryTranscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (audioIngestionId: string) => {
      // La función no está en los tipos generados todavía (types.ts se regenera en Lovable).
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: string | null; error: { message: string } | null }>;
      const { data: jobId, error } = await rpc('retry_failed_transcription', { p_audio_ingestion_id: audioIngestionId });
      if (error) throw new Error(error.message);
      // Se lanza ya para no esperar al cron (5 min); si falla la llamada, el cron lo recoge.
      if (jobId) {
        await supabase.functions.invoke('process-transcription-job', { body: { transcriptionJobId: jobId } }).catch(() => {});
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['transcription-issues'] });
    },
  });
}

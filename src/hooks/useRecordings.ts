import { qk } from '@/lib/query-keys';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const LIST_DAYS = 30;

interface RecordingRow {
  id: string;
  source: string;
  status: string;
  professional_id: string;
  patient_id: string | null;
  session_id: string | null;
  duration_ms: number | null;
  created_at: string;
  job: { status: string; error_code: string | null }[] | null;
  transcripts: { id: string }[] | null;
}


export function useRecordingsPage(range: { from: number; to: number }) {
  const { user, profile, isAdmin } = useAuth();
  return useQuery({
    queryKey: qk.recordings.page({ centerId: profile?.center_id, userId: user?.id, isAdmin }, range.from, range.to),
    queryFn: async () => {
      const since = new Date(Date.now() - LIST_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('audio_ingestions')
        .select('id, source, status, professional_id, patient_id, session_id, duration_ms, created_at, job:transcription_jobs(status, error_code), transcripts(id)', { count: 'exact' })
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }).range(range.from, range.to);
      if (!isAdmin) query = query.eq('professional_id', user!.id);
      const { data: rows, error, count } = await query;
      if (error) throw error;
      const recordings = (rows ?? []) as unknown as RecordingRow[];

      const patientIds = [...new Set(recordings.map((r) => r.patient_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (patientIds.length) {
        const { data: patients } = await supabase.from('patients').select('id, first_name, last_name').in('id', patientIds);
        for (const p of patients ?? []) names.set(p.id, `${p.first_name} ${p.last_name ?? ''}`.trim());
      }
      return { rows: recordings.map((r) => ({ ...r, patientName: r.patient_id ? names.get(r.patient_id) ?? null : null })), total: count ?? 0 };
    },
    enabled: !!user?.id && !!profile?.center_id,
    placeholderData: keepPreviousData,
    refetchInterval: 60 * 1000,
  });
}

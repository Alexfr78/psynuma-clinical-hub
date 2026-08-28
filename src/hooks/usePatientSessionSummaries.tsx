import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PatientSessionSummary {
  lastSessionDate: string | null;
  nextSessionDate: string | null;
  nextSessionTime: string | null;
}

/**
 * Last completed session + next upcoming session per patient, computed from
 * a bounded window of sessions (±180 days) rather than one query per patient.
 */
export function usePatientSessionSummaries() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['patient-session-summaries'],
    queryFn: async () => {
      const now = new Date();
      const from = format(new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
      const to = format(new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
      const today = format(now, 'yyyy-MM-dd');
      const nowTime = format(now, 'HH:mm:ss');

      const { data, error } = await supabase
        .from('sessions')
        .select('patient_id, session_date, start_time, status, session_type')
        .gte('session_date', from)
        .lte('session_date', to)
        .neq('status', 'cancelled')
        .neq('status', 'no_show')
        .neq('status', 'blocked')
        .neq('session_type', 'Bloqueado')
        .not('patient_id', 'is', null)
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;

      const summaries = new Map<string, PatientSessionSummary>();
      for (const s of data ?? []) {
        if (!s.patient_id) continue;
        const isFuture = s.session_date > today || (s.session_date === today && s.start_time >= nowTime);
        const current = summaries.get(s.patient_id) ?? { lastSessionDate: null, nextSessionDate: null, nextSessionTime: null };

        if (!isFuture) {
          // Sessions are ordered ascending, so the last past one we see wins.
          current.lastSessionDate = s.session_date;
        } else if (!current.nextSessionDate) {
          // First future session encountered (ascending order) is the next one.
          current.nextSessionDate = s.session_date;
          current.nextSessionTime = s.start_time;
        }
        summaries.set(s.patient_id, current);
      }
      return summaries;
    },
    enabled: !!profile?.center_id,
  });
}

import { useQueries } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';

interface LimitResult {
  limited: boolean;
  allowed: boolean;
  used?: number;
  max?: number;
  period_months?: number;
  session_type_name?: string;
}

interface SessionTypeLimitNoticeProps {
  /** Titular y, en sesiones de pareja, el otro miembro. */
  patientIds: Array<string | null | undefined>;
  sessionTypeId?: string | null;
  sessionDate?: Date | null;
  /** Al editar una cita existente, para que no se cuente a sí misma. */
  excludeSessionId?: string | null;
}

/**
 * Aviso (no bloqueo) cuando el paciente ya agotó el máximo de un servicio
 * (session_types.max_per_patient). La reserva pública y el portal sí bloquean;
 * en la agenda el profesional decide.
 */
export function SessionTypeLimitNotice({ patientIds, sessionTypeId, sessionDate, excludeSessionId }: SessionTypeLimitNoticeProps) {
  const ids = [...new Set(patientIds.filter((id): id is string => !!id))];
  const date = sessionDate ? format(sessionDate, 'yyyy-MM-dd') : null;

  const results = useQueries({
    queries: ids.map((patientId) => ({
      queryKey: ['session-type-limit', patientId, sessionTypeId, date, excludeSessionId ?? null],
      enabled: !!sessionTypeId,
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('check_session_type_limit', {
          p_patient_id: patientId,
          p_session_type_id: sessionTypeId!,
          p_session_date: date ?? undefined,
          p_exclude_session_id: excludeSessionId ?? undefined,
        });
        if (error) throw error;
        return data as unknown as LimitResult;
      },
    })),
  });

  const reached = results
    .map((r) => r.data)
    .filter((r): r is LimitResult => !!r?.limited && !r.allowed);
  if (reached.length === 0) return null;

  const r = reached[0];
  const period = r.period_months && r.period_months > 0 ? ` en ${r.period_months} meses` : '';
  const who = ids.length > 1 ? 'Uno de los pacientes ya tiene' : 'Este paciente ya tiene';

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <Icon name="warning" className="h-4 w-4" />
      <AlertDescription className="text-sm">
        {who} {r.used} de {r.max} «{r.session_type_name}» permitidas{period}. Puedes crear la cita igualmente.
      </AlertDescription>
    </Alert>
  );
}

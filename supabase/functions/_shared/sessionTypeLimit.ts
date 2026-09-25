// Límite de veces que un paciente puede reservar un servicio
// (session_types.max_per_patient). La regla vive en la función SQL
// check_session_type_limit; aquí solo se llama y se redacta el mensaje.
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export interface SessionTypeLimitResult {
  limited: boolean;
  allowed: boolean;
  used?: number;
  max?: number;
  period_months?: number;
  session_type_name?: string;
}

export async function getSessionTypeLimit(
  supabase: SupabaseClient,
  args: { patientId: string; sessionTypeId: string; sessionDate?: string | null; excludeSessionId?: string | null },
): Promise<SessionTypeLimitResult> {
  const { data, error } = await supabase.rpc("check_session_type_limit", {
    p_patient_id: args.patientId,
    p_session_type_id: args.sessionTypeId,
    p_session_date: args.sessionDate ?? null,
    p_exclude_session_id: args.excludeSessionId ?? null,
  });
  if (error) throw error;
  return (data ?? { limited: false, allowed: true }) as SessionTypeLimitResult;
}

export function sessionTypeLimitMessage(result: SessionTypeLimitResult): string {
  const name = result.session_type_name ?? "este servicio";
  const times = result.max === 1 ? "una vez" : `${result.max} veces`;
  const period = result.period_months && result.period_months > 0
    ? ` cada ${result.period_months === 12 ? "año" : `${result.period_months} meses`}`
    : "";
  return `"${name}" solo se puede reservar ${times}${period} y ya consta en tu historial. Elige otro servicio o contacta con el centro.`;
}

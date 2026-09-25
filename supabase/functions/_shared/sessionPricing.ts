// Precio de una cita reservada por el paciente (reserva pública o portal).
//
// Se resuelve con resolve_effective_price (precio personalizado del paciente >
// plan de tarifa > precio base) ANTES de crear la sesión, y ese mismo importe se
// usa para las reglas de pago, el cobro por adelantado (Stripe cobra
// sessions.price) y el propio registro. Se guardan también los campos de origen
// del precio: con pricing_source 'custom'/'tariff_plan' el trigger
// apply_resolved_price_to_session no vuelve a tocarlo, y con 'base' solo
// completa base_price_snapshot.
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

export interface ResolvedSessionPrice {
  price: number;
  /** Campos para el insert en `sessions`. */
  fields: {
    session_type_id: string;
    price: number;
    pricing_source: string;
    base_price_snapshot: number | null;
    custom_price_id: string | null;
    tariff_plan_id_snapshot: string | null;
    tariff_plan_assignment_id_snapshot: string | null;
  };
}

export async function resolveSessionTypePrice(
  supabase: SupabaseClient,
  args: { patientId: string; sessionTypeId: string; sessionDate: string; defaultPrice: number | string | null },
): Promise<ResolvedSessionPrice> {
  const fallback = Number(args.defaultPrice || 0);
  const { data, error } = await supabase.rpc("resolve_effective_price", {
    p_patient_id: args.patientId,
    p_target_type: "session_type",
    p_target_id: args.sessionTypeId,
    p_reference_date: args.sessionDate,
  });
  if (error) {
    // Sin resolvedor se mantiene el comportamiento anterior (precio base).
    console.error("[session-pricing] resolve_effective_price failed; using default price", error);
  }
  const r = (error ? null : data) as Record<string, unknown> | null;
  const applied = r?.applied_price != null ? Number(r.applied_price) : NaN;
  const price = Number.isFinite(applied) ? applied : fallback;
  const base = r?.base_price != null ? Number(r.base_price) : fallback;

  return {
    price,
    fields: {
      session_type_id: args.sessionTypeId,
      price,
      pricing_source: typeof r?.pricing_source === "string" ? r.pricing_source : "base",
      base_price_snapshot: Number.isFinite(base) ? base : null,
      custom_price_id: (r?.custom_price_id as string | null) ?? null,
      tariff_plan_id_snapshot: (r?.tariff_plan_id as string | null) ?? null,
      tariff_plan_assignment_id_snapshot: (r?.tariff_plan_assignment_id as string | null) ?? null,
    },
  };
}

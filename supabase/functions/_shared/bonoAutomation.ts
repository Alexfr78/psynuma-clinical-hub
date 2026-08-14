// System-side bono helpers for patient/public booking flows.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AutoApplyBonoResult {
  applied: boolean;
  bonoId: string | null;
  remainingSessions: number | null;
  error: string | null;
}

interface BonoRow {
  id: string;
  total_sessions: number | null;
  used_sessions: number | null;
}

export async function autoApplyAvailableBonoToSession(
  supabase: SupabaseClient,
  args: {
    centerId: string;
    patientId: string;
    sessionId: string;
    shouldApply: boolean;
  },
): Promise<AutoApplyBonoResult> {
  if (!args.shouldApply) {
    return { applied: false, bonoId: null, remainingSessions: null, error: null };
  }

  const { data: bonos, error: bonoError } = await supabase
    .from("bonos")
    .select("id, total_sessions, used_sessions")
    .eq("center_id", args.centerId)
    .eq("patient_id", args.patientId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (bonoError) {
    console.error("[bono-automation] Error loading bonos:", bonoError);
    return { applied: false, bonoId: null, remainingSessions: null, error: bonoError.message };
  }

  const bono = ((bonos || []) as BonoRow[]).find((item) => {
    const total = Number(item.total_sessions || 0);
    const used = Number(item.used_sessions || 0);
    return total > used;
  });

  if (!bono) {
    return { applied: false, bonoId: null, remainingSessions: null, error: null };
  }

  const { error: itemError } = await supabase
    .from("bono_items")
    .insert({
      bono_id: bono.id,
      session_id: args.sessionId,
    });

  if (itemError && itemError.code !== "23505") {
    console.error("[bono-automation] Error inserting bono item:", itemError);
    return { applied: false, bonoId: bono.id, remainingSessions: null, error: itemError.message };
  }

  const wasInserted = !itemError;
  const nextUsedSessions = Number(bono.used_sessions || 0) + (wasInserted ? 1 : 0);
  const totalSessions = Number(bono.total_sessions || 0);
  const remainingSessions = Math.max(totalSessions - nextUsedSessions, 0);

  const updates = [
    supabase
      .from("sessions")
      .update({
        bono_id: bono.id,
        price: 0,
        payment_status: "paid",
        advance_payment_due_at: null,
        advance_payment_limit_hours: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.sessionId)
      .eq("center_id", args.centerId),
    supabase
      .from("debts")
      .delete()
      .eq("session_id", args.sessionId)
      .or("paid_amount.is.null,paid_amount.eq.0")
      .is("invoice_id", null),
    supabase
      .from("billable_events")
      .update({
        amount: 0,
        billing_status: "settled",
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", args.sessionId),
  ];

  if (wasInserted) {
    updates.push(
      supabase
        .from("bonos")
        .update({
          used_sessions: nextUsedSessions,
          status: nextUsedSessions >= totalSessions ? "exhausted" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bono.id)
        .eq("center_id", args.centerId),
    );
  }

  const results = await Promise.all(updates);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    console.error("[bono-automation] Error applying bono:", firstError);
    return { applied: false, bonoId: bono.id, remainingSessions: null, error: firstError.message };
  }

  return {
    applied: true,
    bonoId: bono.id,
    remainingSessions,
    error: null,
  };
}

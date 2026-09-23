export type WhatsAppReplyIntent = "confirm" | "opt_out" | "opt_in" | "none";

/** Normalizes user-entered WhatsApp text for exact intent matching. */
export function normalizeWhatsAppReply(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CONFIRM_REPLIES = new Set([
  "si", "yes", "1", "ok", "okay", "vale", "confirmo", "confirmado",
  "confirmar", "si confirmo", "de acuerdo", "perfecto",
]);

const OPT_OUT_REPLIES = new Set([
  "stop", "baja", "parar", "no quiero recibir mensajes", "no mas mensajes",
  "darme de baja", "darse de baja",
]);

const OPT_IN_REPLIES = new Set([
  "start", "alta", "quiero recibir mensajes", "reactivar",
]);

export function classifyReply(text: string): WhatsAppReplyIntent {
  const normalized = normalizeWhatsAppReply(text);
  if (CONFIRM_REPLIES.has(normalized)) return "confirm";
  if (OPT_OUT_REPLIES.has(normalized)) return "opt_out";
  if (OPT_IN_REPLIES.has(normalized)) return "opt_in";
  return "none";
}

/** Digits-only phone key used by the opt-out table and Spanish patient matching. */
export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && /^[6789]/.test(digits)) return `34${digits}`;
  return digits;
}

// SupabaseClient is deliberately structural here so this helper stays importable
// from Deno edge functions without coupling the pure reply classifier to Deno.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isWhatsAppOptedOut(supabase: any, centerId: string, phone: string): Promise<boolean> {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return false;

  const { data, error } = await supabase
    .from("whatsapp_opt_outs")
    .select("opted_out_at, opted_in_at")
    .eq("center_id", centerId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (error) {
    console.error("[whatsapp-opt-out] Error checking opt-out status:", error);
    // Fail open for an unavailable preference lookup; this avoids turning a
    // schema/deployment issue into a broad WhatsApp outage.
    return false;
  }

  if (!data?.opted_out_at) return false;
  return data.opted_in_at == null || data.opted_in_at < data.opted_out_at;
}

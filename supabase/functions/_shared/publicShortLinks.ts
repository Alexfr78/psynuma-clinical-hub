export type PublicShortLinkTarget = "session" | "session_payment" | "debt" | "debt_bono" | "invoice";

// This helper is called from many edge functions that don't all share the same
// @supabase/supabase-js version/instantiation, and the real client's query
// builder result (PostgrestBuilder) is a thenable, not a strict Promise — so a
// precisely typed structural interface here rejects perfectly valid callers.
// Kept intentionally loose for the same reason as _shared/createInvoice.ts.
type PublicShortLinkClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CODE_LENGTH = 10;

function generateCode(length = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export async function getOrCreatePublicShortLink(args: {
  supabase: PublicShortLinkClient;
  centerId: string;
  targetType: PublicShortLinkTarget;
  targetToken: string;
  expiresAt?: string | null;
}): Promise<string | null> {
  if (!args.targetToken) return null;

  const { data: existing, error: existingError } = await args.supabase
    .from("public_short_links")
    .select("code, revoked_at, expires_at")
    .eq("target_type", args.targetType)
    .eq("target_token", args.targetToken)
    .eq("center_id", args.centerId)
    .maybeSingle();

  if (!existingError && existing && !existing.revoked_at) {
    if (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now()) {
      return `/enlace/${existing.code}`;
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateCode();
    const { error } = await args.supabase
      .from("public_short_links")
      .upsert({
        code,
        center_id: args.centerId,
        target_type: args.targetType,
        target_token: args.targetToken,
        expires_at: args.expiresAt ?? null,
        revoked_at: null,
      }, { onConflict: "target_type,target_token" });

    if (!error) return `/enlace/${code}`;
    if (!error.message.toLowerCase().includes("duplicate") && !error.message.toLowerCase().includes("unique")) {
      console.error("[public-short-links] Could not create short link:", error.message);
      return null;
    }
  }

  console.error("[public-short-links] Could not allocate a unique code");
  return null;
}

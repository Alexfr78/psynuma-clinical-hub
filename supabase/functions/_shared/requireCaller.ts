import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Quién llama a una edge function que tiene `verify_jwt = false` y trabaja con la service role.
 *
 * Sin esta comprobación, cualquiera que conozca la URL (está en el bundle público) puede
 * pedir envíos a nombre de un centro. Se aceptan dos llamantes:
 *  - `service`: otra edge function o un cron, que llaman con la service role key.
 *  - `user`: un profesional autenticado con centro asignado; solo puede actuar sobre su centro.
 */
export type Caller =
  | { kind: "service" }
  | { kind: "user"; userId: string; centerId: string };

export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && jwt === serviceKey) return { kind: "service" };

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("center_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.center_id) return null;

  return { kind: "user", userId: data.user.id, centerId: profile.center_id as string };
}

export function canActOnCenter(caller: Caller, centerId: string | null | undefined): boolean {
  return caller.kind === "service" || (!!centerId && caller.centerId === centerId);
}

export function callerErrorResponse(
  status: 401 | 403,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: status === 401 ? "Unauthorized" : "Forbidden" }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

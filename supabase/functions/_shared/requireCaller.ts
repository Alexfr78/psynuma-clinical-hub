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

  // Con el formato nuevo de claves, lo que llega de otra edge function no es
  // literalmente SUPABASE_SERVICE_ROLE_KEY sino un JWT con role=service_role.
  // El claim leído aquí no está verificado: se confirma pidiendo a Auth algo
  // que solo la service role puede leer.
  if (unverifiedJwtRole(jwt) === "service_role") {
    return (await isServiceRoleToken(jwt)) ? { kind: "service" } : null;
  }

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

function unverifiedJwtRole(jwt: string): string | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

// El endpoint de administración de Auth solo responde 200 a un token de service role
// válido (firma comprobada por Auth), así que sirve de verificación.
async function isServiceRoleToken(jwt: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const apikey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !apikey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey },
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
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

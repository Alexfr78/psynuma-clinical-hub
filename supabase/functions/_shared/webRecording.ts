import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const WEB_AUDIO_BUCKET = "session-audio";
export const webRecordingCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function webRecordingResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...webRecordingCors, "Content-Type": "application/json" } });
}
export class WebRecordingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function authorizeWebRecording(req: Request, id: unknown) {
  if (req.method !== "POST") throw new WebRecordingError("Método no permitido", 405);
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new WebRecordingError("audioIngestionId no válido");
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new WebRecordingError("No autorizado", 401);
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await auth.auth.getClaims(jwt);
  const claims = data?.claims as { role?: string; sub?: string } | undefined;
  if (error || claims?.role !== "authenticated" || !claims.sub) throw new WebRecordingError("No autorizado", 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [{ data: profile }, { data: roles }, { data: ingestion, error: ingestionError }] = await Promise.all([
    supabase.from("profiles").select("center_id").eq("id", claims.sub).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", claims.sub).in("role", ["admin", "professional"]),
    supabase.from("audio_ingestions").select("id, center_id, professional_id, source, status, storage_path, mime_type, size_bytes, duration_ms").eq("id", id).maybeSingle(),
  ]);
  if (ingestionError || !ingestion) throw new WebRecordingError("Grabación no encontrada", 404);
  if (!roles?.length || !profile?.center_id || profile.center_id !== ingestion.center_id || ingestion.professional_id !== claims.sub) {
    throw new WebRecordingError("No tienes permiso para acceder a esta grabación", 403);
  }
  if (ingestion.source !== "web_recorder") throw new WebRecordingError("Esta ingesta no es una grabación web", 409);
  // Derive paths from trusted ids, never from a client-editable storage_path.
  const path = `${ingestion.center_id}/${ingestion.id}/audio`;
  return { supabase, ingestion, path, partsPath: `${ingestion.center_id}/${ingestion.id}/parts` };
}
export async function listWebRecordingParts(supabase: SupabaseClient, prefix: string) {
  const files: { name: string; metadata: Record<string, unknown> | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(WEB_AUDIO_BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new WebRecordingError("No se pudieron consultar las partes", 503);
    files.push(...(data ?? []));
    if (!data || data.length < 1000) return files;
    if (files.length > 10000) throw new WebRecordingError("Demasiadas partes", 413);
  }
}
export async function removeWebRecordingParts(supabase: SupabaseClient, prefix: string) {
  const files = await listWebRecordingParts(supabase, prefix);
  for (let offset = 0; offset < files.length; offset += 100) {
    const { error } = await supabase.storage.from(WEB_AUDIO_BUCKET).remove(files.slice(offset, offset + 100).map((f) => `${prefix}/${f.name}`));
    if (error) throw new WebRecordingError("No se pudieron eliminar las partes", 503);
  }
}

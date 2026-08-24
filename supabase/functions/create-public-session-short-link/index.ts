import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreatePublicShortLink } from "../_shared/publicShortLinks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid authentication" }, 401);

    const { session_id: sessionId } = await req.json() as { session_id?: string };
    if (!sessionId) return json({ error: "session_id es requerido" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      serviceClient.from("profiles").select("id, center_id").eq("id", authData.user.id).maybeSingle(),
      serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id),
    ]);
    const isAdmin = (roleRows || []).some((row: { role: string }) => row.role === "admin");
    const isProfessional = (roleRows || []).some((row: { role: string }) => row.role === "professional");
    if (!profile?.center_id || (!isAdmin && !isProfessional)) return json({ error: "Not authorized" }, 403);

    const { data: session, error: sessionError } = await serviceClient
      .from("sessions")
      .select("id, center_id, professional_id, access_token")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError || !session) return json({ error: "Session not found" }, 404);
    if (session.center_id !== profile.center_id || (!isAdmin && session.professional_id !== authData.user.id)) {
      return json({ error: "Not authorized for this session" }, 403);
    }
    if (!session.access_token) return json({ error: "La cita no tiene enlace público" }, 400);

    const path = await getOrCreatePublicShortLink({
      supabase: serviceClient,
      centerId: session.center_id,
      targetType: "session",
      targetToken: session.access_token,
      expiresAt: null,
    });
    if (!path) return json({ error: "No se pudo crear el enlace corto" }, 500);
    return json({ path });
  } catch (error) {
    console.error("[create-public-session-short-link] Error:", error);
    return json({ error: "No se pudo crear el enlace corto" }, 500);
  }
});

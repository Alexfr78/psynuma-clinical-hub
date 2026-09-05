import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await supabase.from("profiles").select("center_id").eq("id", user.id).single();
    if (!profile?.center_id) {
      return new Response(JSON.stringify({ error: "Sin centro asignado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roles?.some((r) => r.role === "admin");

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";

    if (action === "disconnect") {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Solo administradores pueden desconectar Plaud" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabase
        .from("center_plaud_connections")
        .delete()
        .eq("center_id", profile.center_id);

      if (deleteError) {
        console.error("[plaud-connection] Disconnect error:", deleteError);
        return new Response(JSON.stringify({ error: "No se pudo desconectar" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "set_enabled") {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Solo administradores pueden activar o desactivar la ingesta de Plaud" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const enabled = body.enabled === true;

      const { data: connection } = await supabase
        .from("center_plaud_connections")
        .select("center_id, needs_reconnect")
        .eq("center_id", profile.center_id)
        .maybeSingle();

      if (!connection) {
        return new Response(
          JSON.stringify({ error: "Conecta Plaud antes de activar la ingesta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (enabled && connection.needs_reconnect) {
        return new Response(
          JSON.stringify({ error: "Reconecta Plaud antes de activar la ingesta" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("center_plaud_connections")
        .update({ enabled })
        .eq("center_id", profile.center_id);

      if (updateError) {
        console.error("[plaud-connection] set_enabled error:", updateError);
        return new Response(JSON.stringify({ error: "No se pudo actualizar la ingesta" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, enabled }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Default: status. Only non-sensitive fields — never tokens.
    const { data: connection } = await supabase
      .from("center_plaud_connections")
      .select("plaud_account_label, enabled, needs_reconnect, last_error, created_at")
      .eq("center_id", profile.center_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ connected: !!connection, ...(connection || {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[plaud-connection] Error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

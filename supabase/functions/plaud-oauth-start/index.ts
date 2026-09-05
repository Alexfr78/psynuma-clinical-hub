import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import {
  PLAUD_AUTHORIZE_ENDPOINT,
  generatePkcePair,
  generatePlaudOAuthState,
  registerPlaudClient,
} from "../_shared/plaud.ts";

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
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden conectar Plaud" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redirectUri = `${supabaseUrl}/functions/v1/plaud-oauth-callback`;

    // Reuse a previously registered dynamic client for this center instead
    // of registering a new one on every (re)connect. Plaud has no manual
    // "create an app" console for third parties (only RFC 7591 dynamic
    // registration was found to be publicly reachable, unauthenticated,
    // during the design phase), so this is the only registration path there
    // is — not a shortcut chosen over a manual alternative.
    let clientId: string | null = null;
    const { data: existingConnection } = await supabase
      .from("center_plaud_connections")
      .select("plaud_client_id_encrypted")
      .eq("center_id", profile.center_id)
      .maybeSingle();

    if (existingConnection?.plaud_client_id_encrypted) {
      try {
        clientId = await decryptSecret(existingConnection.plaud_client_id_encrypted);
      } catch (decryptError) {
        console.error("[plaud-oauth-start] Failed to decrypt stored client_id, registering a new one:", decryptError);
      }
    }

    if (!clientId) {
      try {
        const registration = await registerPlaudClient(redirectUri);
        clientId = registration.clientId;
      } catch (registerError) {
        console.error("[plaud-oauth-start] Dynamic client registration failed:", registerError);
        return new Response(
          JSON.stringify({ error: "No se pudo registrar la aplicación ante Plaud" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { verifier, challenge } = await generatePkcePair();
    const state = generatePlaudOAuthState();

    // Opportunistic cleanup of abandoned attempts before inserting a new one.
    await supabase.from("plaud_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const { error: insertError } = await supabase.from("plaud_oauth_states").insert({
      state,
      center_id: profile.center_id,
      professional_id: user.id,
      client_id: clientId,
      code_verifier_encrypted: await encryptSecret(verifier),
      redirect_uri: redirectUri,
    });

    if (insertError) {
      console.error("[plaud-oauth-start] Failed to store PKCE state:", insertError);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authorizeUrl = new URL(PLAUD_AUTHORIZE_ENDPOINT);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return new Response(
      JSON.stringify({ authorize_url: authorizeUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[plaud-oauth-start] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

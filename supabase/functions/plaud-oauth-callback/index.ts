import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { PLAUD_TOKEN_ENDPOINT, callPlaudTool } from "../_shared/plaud.ts";

function redirect(params: Record<string, string>): Response {
  const siteUrl = Deno.env.get("SITE_URL") || "https://psycma.lovable.app";
  const url = new URL(`${siteUrl}/configuracion`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return Response.redirect(url.toString());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[plaud-oauth-callback] OAuth error:", error);
      return redirect({ oauth: "error", provider: "plaud", message: error });
    }
    if (!code || !state) {
      return redirect({ oauth: "error", provider: "plaud", message: "missing_params" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: pending, error: pendingError } = await supabase
      .from("plaud_oauth_states")
      .select("center_id, professional_id, client_id, code_verifier_encrypted, redirect_uri, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (pendingError || !pending) {
      console.error("[plaud-oauth-callback] Unknown or already-used state:", pendingError);
      return redirect({ oauth: "error", provider: "plaud", message: "invalid_state" });
    }

    // Single-use: delete immediately so a replayed/duplicated callback can't
    // reuse the same PKCE verifier.
    await supabase.from("plaud_oauth_states").delete().eq("state", state);

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      return redirect({ oauth: "error", provider: "plaud", message: "expired_state" });
    }

    let codeVerifier: string;
    try {
      codeVerifier = await decryptSecret(pending.code_verifier_encrypted);
    } catch (decryptError) {
      console.error("[plaud-oauth-callback] Failed to decrypt code_verifier:", decryptError);
      return redirect({ oauth: "error", provider: "plaud", message: "decrypt_error" });
    }

    const tokenResponse = await fetch(PLAUD_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirect_uri,
        client_id: pending.client_id,
        code_verifier: codeVerifier,
      }),
    });

    const tokenText = await tokenResponse.text();
    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      console.error("[plaud-oauth-callback] Non-JSON token response:", tokenText.slice(0, 500));
      return redirect({ oauth: "error", provider: "plaud", message: "token_error" });
    }

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.expires_in) {
      console.error("[plaud-oauth-callback] Token exchange error:", tokenText.slice(0, 500));
      return redirect({ oauth: "error", provider: "plaud", message: "token_error" });
    }
    if (!tokenData.refresh_token) {
      // Without a refresh token this connection would die within the hour
      // and need a manual reconnect every time it's used — treat it as a
      // hard error instead of silently storing an unrefreshable session.
      console.error("[plaud-oauth-callback] No refresh_token in token response");
      return redirect({ oauth: "error", provider: "plaud", message: "no_refresh_token" });
    }

    // Best-effort account label for display in Settings. Never persists any
    // recording/note/transcript content — only whatever get_current_user
    // returns as identifying account info (e.g. an email or display name).
    let accountLabel: string | null = null;
    const currentUser = await callPlaudTool<Record<string, unknown>>(
      tokenData.access_token,
      "get_current_user",
      {}
    );
    if (currentUser.ok) {
      const data = currentUser.data as { email?: string; name?: string; username?: string };
      accountLabel = data.email || data.name || data.username || null;
    } else {
      console.warn("[plaud-oauth-callback] get_current_user failed, continuing without a label:", currentUser.error);
    }

    // Deliberately does NOT set `enabled` — it stays at whatever it already
    // was (or the table default of false on first insert). Connecting only
    // stores credentials; the center owner must flip the ingestion switch
    // separately in Configuración → Conexiones Externas.
    const { error: upsertError } = await supabase
      .from("center_plaud_connections")
      .upsert(
        {
          center_id: pending.center_id,
          connected_by: pending.professional_id,
          plaud_account_label: accountLabel,
          plaud_client_id_encrypted: await encryptSecret(pending.client_id),
          access_token_encrypted: await encryptSecret(tokenData.access_token),
          refresh_token_encrypted: await encryptSecret(tokenData.refresh_token),
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          scope: tokenData.scope || null,
          needs_reconnect: false,
          last_refresh_at: new Date().toISOString(),
          last_refresh_result: "success",
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "center_id" }
      );

    if (upsertError) {
      console.error("[plaud-oauth-callback] DB error:", upsertError);
      return redirect({ oauth: "error", provider: "plaud", message: "db_error" });
    }

    return redirect({ oauth: "success", provider: "plaud" });
  } catch (error) {
    console.error("[plaud-oauth-callback] Unexpected error:", error);
    return redirect({ oauth: "error", provider: "plaud", message: "unknown_error" });
  }
});

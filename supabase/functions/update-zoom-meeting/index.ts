import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function decryptAES256GCM(encryptedData: string, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(encryptionKey.padEnd(32, "0").slice(0, 32));
  const encryptedBytes = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);
  const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertextWithTag);
  return new TextDecoder().decode(decrypted);
}

async function getZoomClientCredentials(supabase: SupabaseClient, professionalId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("center_id")
    .eq("id", professionalId)
    .single();

  if (!profile?.center_id) return null;

  const { data: center } = await supabase
    .from("centers")
    .select("oauth_zoom_client_id, oauth_zoom_credentials")
    .eq("id", profile.center_id)
    .single();

  const encryptionKey = Deno.env.get("CERTIFICATE_ENCRYPTION_KEY");
  if (!center?.oauth_zoom_client_id || !center?.oauth_zoom_credentials || !encryptionKey) return null;

  return {
    clientId: center.oauth_zoom_client_id,
    clientSecret: await decryptAES256GCM(center.oauth_zoom_credentials, encryptionKey),
  };
}

async function refreshZoomToken(
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string,
): Promise<string | null> {
  const credentials = await getZoomClientCredentials(supabase, professionalId);
  if (!credentials) return null;

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    console.error("[update-zoom-meeting] Token refresh failed:", await response.text());
    return null;
  }

  const tokenData = await response.json();
  await supabase
    .from("oauth_connections")
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    })
    .eq("professional_id", professionalId)
    .eq("provider", "zoom");

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { professional_id, meeting_id, session_date, start_time, end_time } = await req.json();
    if (!professional_id || !meeting_id || !session_date || !start_time || !end_time) {
      return new Response(
        JSON.stringify({ success: false, error: "Faltan datos para actualizar la reunion de Zoom" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: connection } = await supabase
      .from("oauth_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("professional_id", professional_id)
      .eq("provider", "zoom")
      .single();

    if (!connection) {
      return new Response(
        JSON.stringify({ success: false, error: "Zoom no esta conectado para este profesional" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accessToken = connection.access_token;
    if (new Date(connection.expires_at) <= new Date()) {
      accessToken = await refreshZoomToken(supabase, professional_id, connection.refresh_token);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ success: false, error: "No se pudo renovar la conexion con Zoom" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const [startHour, startMinute] = start_time.split(":").map(Number);
    const [endHour, endMinute] = end_time.split(":").map(Number);
    const duration = Math.max(1, endHour * 60 + endMinute - (startHour * 60 + startMinute));
    const zoomResponse = await fetch(`https://api.zoom.us/v2/meetings/${meeting_id}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_time: `${session_date}T${start_time.slice(0, 5)}:00`,
        duration,
        timezone: "Europe/Madrid",
      }),
    });

    if (!zoomResponse.ok) {
      const details = await zoomResponse.text();
      console.error("[update-zoom-meeting] Zoom API error:", zoomResponse.status, details);
      return new Response(
        JSON.stringify({ success: false, error: "No se pudo actualizar la reunion de Zoom", details }),
        { status: zoomResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[update-zoom-meeting] Unhandled error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Error interno al actualizar Zoom" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

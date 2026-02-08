import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://api.wasenderapi.com/api/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wasenderApiKey = Deno.env.get("WASENDER_API_KEY");
    const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");

    if (!wasenderApiKey || !wasenderToken) {
      return new Response(JSON.stringify({ 
        error: "WasenderAPI credentials not configured",
        code: "CREDENTIALS_MISSING"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's center
    const { data: profile } = await supabase
      .from("profiles")
      .select("center_id")
      .eq("id", user.id)
      .single();

    if (!profile?.center_id) {
      return new Response(JSON.stringify({ error: "No center found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Request QR code from WasenderAPI
    // First, get session status
    const sessionResponse = await fetch(`${WASENDER_API_URL}/sessions`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${wasenderToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error("WasenderAPI session error:", errorText);
      return new Response(JSON.stringify({ 
        error: "Error connecting to WasenderAPI",
        details: errorText
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionData = await sessionResponse.json();
    console.log("WasenderAPI session data:", sessionData);

    // Get QR code if session needs connection
    let qrCode = null;
    let sessionStatus = "disconnected";
    let wasenderSessionId = null;

    if (sessionData.data && sessionData.data.length > 0) {
      const session = sessionData.data[0];
      wasenderSessionId = session.id;
      sessionStatus = session.status || "disconnected";

      if (sessionStatus === "need_scan" || sessionStatus === "disconnected") {
        // Request QR code
        const qrResponse = await fetch(`${WASENDER_API_URL}/sessions/${wasenderSessionId}/qr`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${wasenderToken}`,
            "Content-Type": "application/json",
          },
        });

        if (qrResponse.ok) {
          const qrData = await qrResponse.json();
          qrCode = qrData.data?.qr || qrData.qr;
        }
      }
    } else {
      // Create a new session if none exists
      const createResponse = await fetch(`${WASENDER_API_URL}/sessions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${wasenderToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `psycma-${profile.center_id.substring(0, 8)}`,
        }),
      });

      if (createResponse.ok) {
        const createData = await createResponse.json();
        wasenderSessionId = createData.data?.id;
        sessionStatus = "need_scan";

        // Get QR for new session
        if (wasenderSessionId) {
          const qrResponse = await fetch(`${WASENDER_API_URL}/sessions/${wasenderSessionId}/qr`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${wasenderToken}`,
              "Content-Type": "application/json",
            },
          });

          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            qrCode = qrData.data?.qr || qrData.qr;
          }
        }
      }
    }

    // Upsert session in database
    const { error: upsertError } = await supabase
      .from("whatsapp_sessions")
      .upsert({
        center_id: profile.center_id,
        wasender_session_id: wasenderSessionId,
        status: sessionStatus,
        qr_code: qrCode,
        updated_at: new Date().toISOString(),
        ...(sessionStatus === "connected" ? { last_connected_at: new Date().toISOString() } : {}),
      }, {
        onConflict: "center_id",
      });

    if (upsertError) {
      console.error("Error upserting session:", upsertError);
    }

    return new Response(JSON.stringify({
      status: sessionStatus,
      qr_code: qrCode,
      session_id: wasenderSessionId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

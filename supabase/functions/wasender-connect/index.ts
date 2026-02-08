import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://www.wasenderapi.com/api";

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

    // Request sessions list from WasenderAPI
    console.log("Fetching sessions from WasenderAPI...");
    const sessionResponse = await fetch(`${WASENDER_API_URL}/whatsapp-sessions`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${wasenderToken}`,
        "Accept": "application/json",
      },
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error("WasenderAPI session error:", errorText);
      return new Response(JSON.stringify({ 
        error: "Error connecting to WasenderAPI",
        details: errorText.substring(0, 500)
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionData = await sessionResponse.json();
    console.log("WasenderAPI session data:", JSON.stringify(sessionData));

    // Get QR code if session needs connection
    let qrCode = null;
    let sessionStatus = "disconnected";
    let wasenderSessionId = null;
    let phoneNumber = null;

    // Handle the response format - wasenderapi returns data directly or in a data wrapper
    const sessions = sessionData.data || sessionData;
    
    if (Array.isArray(sessions) && sessions.length > 0) {
      const session = sessions[0];
      wasenderSessionId = session.id;
      sessionStatus = session.status || "disconnected";
      phoneNumber = session.phone_number || null;
      console.log(`Found existing session: ${wasenderSessionId}, status: ${sessionStatus}, phone: ${phoneNumber}`);

      if (sessionStatus === "need_scan" || sessionStatus === "disconnected" || sessionStatus === "STOPPED") {
        // Request QR code
        console.log("Requesting QR code...");
        const qrResponse = await fetch(`${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/qrcode`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${wasenderToken}`,
            "Accept": "application/json",
          },
        });

        if (qrResponse.ok) {
          const qrData = await qrResponse.json();
          qrCode = qrData.data?.qrCode || qrData.qrCode || qrData.data?.qr || qrData.qr;
          console.log("QR code retrieved successfully");
        } else {
          const qrError = await qrResponse.text();
          console.log("QR response not ok:", qrError.substring(0, 300));
        }
      }
    } else {
      // Create a new session if none exists
      console.log("No existing sessions, creating new one...");
      const createResponse = await fetch(`${WASENDER_API_URL}/whatsapp-sessions`, {
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
        wasenderSessionId = createData.data?.id || createData.id;
        sessionStatus = "need_scan";
        console.log("Created new session:", wasenderSessionId);

        // Get QR for new session
        if (wasenderSessionId) {
          const qrResponse = await fetch(`${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/qrcode`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${wasenderToken}`,
              "Accept": "application/json",
            },
          });

          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            qrCode = qrData.data?.qrCode || qrData.qrCode || qrData.data?.qr || qrData.qr;
          }
        }
      } else {
        const createError = await createResponse.text();
        console.error("Error creating session:", createError.substring(0, 300));
      }
    }

    // Upsert session in database
    const upsertData: Record<string, unknown> = {
      center_id: profile.center_id,
      wasender_session_id: String(wasenderSessionId),
      status: sessionStatus,
      qr_code: qrCode,
      phone_number: phoneNumber,
      updated_at: new Date().toISOString(),
    };
    
    if (sessionStatus === "connected") {
      upsertData.last_connected_at = new Date().toISOString();
    }

    const { data: upsertedData, error: upsertError } = await supabase
      .from("whatsapp_sessions")
      .upsert(upsertData, {
        onConflict: "center_id",
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting session:", upsertError);
      // Return the data from WasenderAPI even if DB save fails
    } else {
      console.log("Session saved to database:", upsertedData?.id);
    }

    return new Response(JSON.stringify({
      success: true,
      status: sessionStatus,
      qr_code: qrCode,
      session_id: wasenderSessionId,
      phone_number: phoneNumber,
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

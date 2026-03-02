import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Get existing session from DB
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("center_id", profile.center_id)
      .maybeSingle();

    // If session exists and has a wasender_session_id, poll WasenderAPI for real status
    if (session?.wasender_session_id) {
      const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN") || Deno.env.get("WASENDER_API_KEY");
      
      if (wasenderToken) {
        try {
          const WASENDER_API_URL = "https://api.wasenderapi.com/api";
          const statusRes = await fetch(
            `${WASENDER_API_URL}/whatsapp-sessions/${session.wasender_session_id}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${wasenderToken}`,
                "Accept": "application/json",
              },
            }
          );

          if (statusRes.ok) {
            const statusData = await statusRes.json();
            console.log("WasenderAPI session status:", JSON.stringify(statusData));

            const rawStatus = statusData.data?.status || statusData.status || "";
            const phoneNumber = statusData.data?.phone || statusData.phone || 
                                statusData.data?.phone_number || statusData.phone_number || null;
            const sessionApiKey = statusData.data?.api_key || statusData.api_key || null;

            // Map WasenderAPI statuses to our DB statuses
            const statusMap: Record<string, string> = {
              "WORKING": "connected",
              "working": "connected",
              "connected": "connected",
              "CONNECTED": "connected",
              "authenticated": "connected",
              "AUTHENTICATED": "connected",
              "ready": "connected",
              "READY": "connected",
              "SCAN_QR_CODE": "need_scan",
              "scan_qr_code": "need_scan",
              "need_scan": "need_scan",
              "qr": "need_scan",
              "STOPPED": "disconnected",
              "stopped": "disconnected",
              "disconnected": "disconnected",
              "DISCONNECTED": "disconnected",
              "logged_out": "disconnected",
              "LOGGED_OUT": "disconnected",
              "expired": "disconnected",
              "EXPIRED": "disconnected",
              "FAILED": "disconnected",
              "failed": "disconnected",
            };

            const mappedStatus = statusMap[rawStatus] || statusMap[rawStatus.toLowerCase()] || session.status;

            // Update DB if status changed
            if (mappedStatus !== session.status || (phoneNumber && phoneNumber !== session.phone_number)) {
              const updateData: Record<string, unknown> = {
                status: mappedStatus,
                updated_at: new Date().toISOString(),
              };

              if (mappedStatus === "connected") {
                updateData.last_connected_at = new Date().toISOString();
                updateData.qr_code = null; // Clear QR once connected
                if (phoneNumber) updateData.phone_number = phoneNumber;
                if (sessionApiKey) updateData.api_key = sessionApiKey;
              }

              if (mappedStatus === "disconnected") {
                updateData.qr_code = null;
              }

              await supabase
                .from("whatsapp_sessions")
                .update(updateData)
                .eq("id", session.id);

              // Return updated session
              const { data: updatedSession } = await supabase
                .from("whatsapp_sessions")
                .select("*")
                .eq("id", session.id)
                .single();

              return new Response(JSON.stringify({ session: updatedSession }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch (apiError) {
          console.error("Error polling WasenderAPI:", apiError);
          // Continue with cached session data
        }
      }
    }

    return new Response(JSON.stringify({ session }), {
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

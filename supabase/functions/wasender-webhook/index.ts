import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("WASENDER_WEBHOOK_SECRET");

    // Webhook secret is mandatory - reject if not configured
    if (!webhookSecret) {
      console.error("WASENDER_WEBHOOK_SECRET not configured - rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify webhook secret
    const receivedSecret = req.headers.get("x-webhook-secret");
    if (receivedSecret !== webhookSecret) {
      console.warn("Invalid webhook secret received");
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("Webhook payload:", JSON.stringify(payload));

    const eventType = payload.event || payload.type;
    const data = payload.data || payload;

    switch (eventType) {
      case "message.status":
      case "message_status": {
        // Message delivery status update
        const messageId = data.message_id || data.id;
        const status = data.status; // delivered, read, failed

        if (messageId) {
          const { error } = await supabase
            .from("whatsapp_messages")
            .update({
              status: status === "delivered" || status === "read" ? "delivered" : status,
              delivered_at: status === "delivered" || status === "read" 
                ? new Date().toISOString() 
                : null,
              error_message: status === "failed" ? data.error || data.reason : null,
            })
            .eq("wasender_message_id", messageId);

          if (error) {
            console.error("Error updating message status:", error);
          }
        }
        break;
      }

      case "session.status":
      case "session_status": {
        // Session status change
        const sessionId = data.session_id || data.id;
        const status = data.status; // connected, disconnected, expired

        if (sessionId) {
          const { error } = await supabase
            .from("whatsapp_sessions")
            .update({
              status,
              ...(status === "connected" ? { last_connected_at: new Date().toISOString() } : {}),
              ...(status === "disconnected" || status === "expired" ? { qr_code: null } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("wasender_session_id", sessionId);

          if (error) {
            console.error("Error updating session status:", error);
          }
        }
        break;
      }

      case "qr.updated":
      case "qr_updated": {
        // QR code updated
        const sessionId = data.session_id || data.id;
        const qrCode = data.qr || data.qr_code;

        if (sessionId && qrCode) {
          const { error } = await supabase
            .from("whatsapp_sessions")
            .update({
              qr_code: qrCode,
              status: "need_scan",
              updated_at: new Date().toISOString(),
            })
            .eq("wasender_session_id", sessionId);

          if (error) {
            console.error("Error updating QR code:", error);
          }
        }
        break;
      }

      case "message.received":
      case "incoming_message": {
        // Incoming message - log for reference
        console.log("Incoming message received:", data);
        // Could store in a separate table for chat functionality
        break;
      }

      default:
        console.log("Unknown webhook event:", eventType);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

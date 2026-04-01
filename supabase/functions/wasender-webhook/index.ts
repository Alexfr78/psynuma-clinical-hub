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

    if (!webhookSecret) {
      console.error("[wasender-webhook] WASENDER_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receivedSecret = req.headers.get("x-webhook-secret");
    if (receivedSecret !== webhookSecret) {
      console.warn("[wasender-webhook] Invalid webhook secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const eventType = payload.event || payload.type;
    console.log("[wasender-webhook] Event received:", eventType);
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

      case "messages.received":
      case "message.received":
      case "incoming_message": {
        console.log("Incoming message received:", JSON.stringify(data));

        // Wasender sends data.messages with messageBody and remoteJid
        const msg = data.messages || data;
        const messageText = (msg.messageBody || msg.message?.text || data.text || data.body || "").trim().toLowerCase();
        const rawPhone = msg.remoteJid || msg.key?.remoteJid || data.from || data.sender || data.phone || "";
        // Strip @s.whatsapp.net suffix if present
        const fromPhone = rawPhone.replace(/@s\.whatsapp\.net$/, "");

        if (!messageText || !fromPhone) {
          console.log("No text or phone in incoming message, skipping");
          break;
        }

        // Check if message is a confirmation
        const confirmationKeywords = ["sí", "si", "yes", "1", "confirmo", "confirmar", "ok", "vale"];
        const isConfirmation = confirmationKeywords.some(kw => messageText === kw || messageText.startsWith(kw));

        if (!isConfirmation) {
          console.log(`Message "${messageText}" is not a confirmation, skipping`);
          break;
        }

        // Normalize phone
        let cleanPhone = fromPhone.replace(/\D/g, "");
        if (cleanPhone.startsWith("34") && cleanPhone.length === 11) {
          cleanPhone = cleanPhone.slice(2);
        }

        console.log(`Confirmation received from phone: ${cleanPhone}`);

        const todayDate = new Date().toISOString().split("T")[0];
        const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];

        // Search patients by phone (try multiple formats)
        const { data: patients } = await supabase
          .from("patients")
          .select("id")
          .or(`phone.eq.${cleanPhone},phone.eq.+34${cleanPhone},phone.eq.34${cleanPhone}`);

        if (!patients || patients.length === 0) {
          console.log(`No patient found for phone ${cleanPhone}`);
          break;
        }

        const patientIds = patients.map((p: { id: string }) => p.id);

        // Find next scheduled session within 48h
        const { data: sessions } = await supabase
          .from("sessions")
          .select("id, session_date, start_time, status, center_id, patient_id")
          .in("patient_id", patientIds)
          .eq("status", "scheduled")
          .gte("session_date", todayDate)
          .lte("session_date", in48h)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1);

        if (!sessions || sessions.length === 0) {
          console.log(`No upcoming scheduled session found for patient(s) ${patientIds.join(", ")}`);
          break;
        }

        const targetSession = sessions[0];

        // Check if center has confirmation reply enabled
        const { data: centerData } = await supabase
          .from("centers")
          .select("wasender_confirmation_reply")
          .eq("id", targetSession.center_id)
          .single();

        if (centerData && centerData.wasender_confirmation_reply === false) {
          console.log("Confirmation reply disabled for this center, skipping");
          break;
        }

        // Update session status to confirmed
        const { error: updateError } = await supabase
          .from("sessions")
          .update({ status: "confirmed" })
          .eq("id", targetSession.id);

        if (updateError) {
          console.error("Error confirming session:", updateError);
          break;
        }

        console.log(`Session ${targetSession.id} confirmed by patient via WhatsApp`);

        // Log the incoming message
        await supabase.from("whatsapp_messages").insert({
          center_id: targetSession.center_id,
          phone: fromPhone,
          content: messageText,
          type: "text",
          message_type: "incoming",
          patient_id: targetSession.patient_id,
          session_id: targetSession.id,
          status: "delivered",
        });

        break;
      }

      default:
        console.log("Unknown webhook event:", eventType);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[wasender-webhook] Unhandled error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

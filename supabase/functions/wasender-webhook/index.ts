import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyReply, normalizeWhatsAppPhone } from "../_shared/whatsapp-reply-intent.ts";

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
        console.log("[wasender-webhook] Incoming message from:", data.messages?.remoteJid || data.from || "unknown");

        // Wasender sends data.messages with messageBody and remoteJid
        const msg = data.messages || data;
        const rawText = (msg.messageBody || msg.message?.text || data.text || data.body || "").trim();
        const rawPhone = msg.remoteJid || msg.key?.remoteJid || data.from || data.sender || data.phone || "";
        // Strip @s.whatsapp.net suffix if present
        const fromPhone = rawPhone.replace(/@s\.whatsapp\.net$/, "");

        if (!rawText || !fromPhone) {
          console.log("No text or phone in incoming message, skipping");
          break;
        }

        const messageText = rawText.toLowerCase();
        const intent = classifyReply(rawText);
        if (intent === "none") {
          console.log(`Message "${messageText}" is not a confirmation, skipping`);
          break;
        }

        // Normalize phone
        let cleanPhone = normalizeWhatsAppPhone(fromPhone);
        if (cleanPhone.startsWith("34") && cleanPhone.length === 11) {
          cleanPhone = cleanPhone.slice(2);
        }

        console.log(`Confirmation received from phone: ${cleanPhone}`);

        const todayDate = new Date().toISOString().split("T")[0];
        const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];

        // The WasenderAPI account is shared by all centers: find out WHICH center's
        // number received this message so we never confirm another center's session.
        const sessionRef = payload.sessionId ?? payload.session_id ?? data.sessionId ?? data.session_id ?? null;
        const signature = req.headers.get("x-webhook-signature");
        let receivingCenterId: string | null = null;

        if (sessionRef != null) {
          const { data: bySession } = await supabase
            .from("whatsapp_sessions")
            .select("center_id")
            .eq("wasender_session_id", String(sessionRef))
            .maybeSingle();
          receivingCenterId = bySession?.center_id ?? null;
        }

        if (!receivingCenterId && signature) {
          const { data: bySecret } = await supabase
            .from("whatsapp_sessions")
            .select("center_id")
            .eq("webhook_secret", signature)
            .maybeSingle();
          receivingCenterId = bySecret?.center_id ?? null;
        }

        if ((intent === "opt_out" || intent === "opt_in") && receivingCenterId) {
          const phoneKey = normalizeWhatsAppPhone(fromPhone);
          const now = new Date().toISOString();
          let preferenceError;
          if (intent === "opt_out") {
            ({ error: preferenceError } = await supabase.from("whatsapp_opt_outs").upsert({
              center_id: receivingCenterId,
              phone: phoneKey,
              opted_out_at: now,
              opted_in_at: null,
              source: "patient_reply",
            }, { onConflict: "center_id,phone" }));
          } else {
            const { data: existingOptOut } = await supabase
              .from("whatsapp_opt_outs")
              .select("id")
              .eq("center_id", receivingCenterId)
              .eq("phone", phoneKey)
              .maybeSingle();
            ({ error: preferenceError } = existingOptOut
              ? await supabase.from("whatsapp_opt_outs").update({ opted_in_at: now }).eq("id", existingOptOut.id)
              : await supabase.from("whatsapp_opt_outs").insert({
                  center_id: receivingCenterId,
                  phone: phoneKey,
                  opted_out_at: now,
                  opted_in_at: now,
                  source: "patient_reply",
                }));
          }
          if (preferenceError) {
            console.error("[wasender-webhook] Error saving WhatsApp opt preference:", preferenceError);
          }
          await supabase.from("whatsapp_messages").insert({
            center_id: receivingCenterId,
            phone: fromPhone,
            content: rawText,
            type: "text",
            direction: "incoming",
            message_type: "incoming",
            status: "delivered",
          });
          break;
        }

        if (intent === "opt_out" || intent === "opt_in") {
          console.warn("[wasender-webhook] Opt preference ignored because receiving center is unknown");
          break;
        }

        // Search patients by phone (try multiple formats)
        let patientQuery = supabase
          .from("patients")
          .select("id, center_id")
          .or(`phone.eq.${cleanPhone},phone.eq.+34${cleanPhone},phone.eq.34${cleanPhone}`);

        if (receivingCenterId) {
          patientQuery = patientQuery.eq("center_id", receivingCenterId);
        }

        const { data: patients } = await patientQuery;

        if (!patients || patients.length === 0) {
          console.log(`No patient found for phone ${cleanPhone}`);
          break;
        }

        // Center unknown: only safe to continue if the phone belongs to a single center
        if (!receivingCenterId) {
          const centerIds = new Set(patients.map((p: { center_id: string }) => p.center_id));
          if (centerIds.size > 1) {
            console.warn(`Phone ${cleanPhone} exists in ${centerIds.size} centers and the receiving center could not be identified, skipping confirmation`);
            break;
          }
          receivingCenterId = [...centerIds][0];
        }

        const patientIds = patients.map((p: { id: string }) => p.id);

        // Find next scheduled session within 48h
        const { data: sessions } = await supabase
          .from("sessions")
          .select("id, session_date, start_time, end_time, status, center_id, patient_id, professional_id, google_calendar_event_id")
          .in("patient_id", patientIds)
          .eq("center_id", receivingCenterId)
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

        // Sync confirmation color (sage green) to Google Calendar if linked
        if (targetSession.google_calendar_event_id) {
          try {
            const { error: gcalError } = await supabase.functions.invoke("update-google-calendar-event", {
              body: {
                professional_id: targetSession.professional_id,
                event_id: targetSession.google_calendar_event_id,
                psycma_session_id: targetSession.id,
                session_date: targetSession.session_date,
                start_time: targetSession.start_time,
                end_time: targetSession.end_time,
                color_id: "2",
                create_if_not_exists: false,
              },
            });
            if (gcalError) {
              console.error("Error syncing confirmation to Google Calendar:", gcalError);
            } else {
              console.log(`Google Calendar event ${targetSession.google_calendar_event_id} updated to confirmed color`);
            }
          } catch (gcalErr) {
            console.error("Exception syncing confirmation to Google Calendar:", gcalErr);
          }
        }

        // Log the incoming message
        await supabase.from("whatsapp_messages").insert({
          center_id: targetSession.center_id,
          phone: fromPhone,
          content: rawText,
          type: "text",
          direction: "incoming",
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

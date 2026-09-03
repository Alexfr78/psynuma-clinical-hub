import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

// Words that count as an affirmative reply to "Responde SÍ para confirmar"
// in a session reminder. Mirrors the WasenderAPI webhook's confirmation
// logic (supabase/functions/wasender-webhook/index.ts) adapted to Meta's
// event shape.
const CONFIRMATION_KEYWORDS = ["sí", "si", "yes", "1", "confirmo", "confirmar", "ok", "vale"];

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const providedHex = signatureHeader.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computedBytes = new Uint8Array(signatureBuffer);

  let providedBytes: Uint8Array;
  try {
    providedBytes = hexToBytes(providedHex);
  } catch {
    return false;
  }

  return timingSafeEqual(computedBytes, providedBytes);
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp?: string;
  errors?: { title?: string; message?: string }[];
}

interface MetaIncomingMessage {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string };
  statuses?: MetaStatus[];
  messages?: MetaIncomingMessage[];
}

async function handleStatuses(supabase: SupabaseClient, statuses: MetaStatus[]) {
  for (const status of statuses) {
    const messageId = status.id;
    if (!messageId) continue;

    const nowIso = new Date().toISOString();
    const isFailed = status.status === "failed";
    const errorMessage = isFailed
      ? (status.errors?.[0]?.message || status.errors?.[0]?.title || "Envío fallido")
      : null;

    const messageUpdate: Record<string, unknown> = { status: status.status };
    if (status.status === "delivered") messageUpdate.delivered_at = nowIso;
    if (status.status === "read") messageUpdate.read_at = nowIso;
    if (isFailed) messageUpdate.error_message = errorMessage;

    const { data: updatedMessages, error: messageError } = await supabase
      .from("whatsapp_messages")
      .update(messageUpdate)
      .eq("meta_message_id", messageId)
      .select("id");

    if (messageError) {
      console.error("[whatsapp-meta-webhook] Error updating whatsapp_messages status:", messageError);
    }

    // notifications only tracks a coarse pending/sent/failed status, so the
    // only state transition worth reflecting there is a later "failed".
    if (isFailed) {
      const { error: notificationError } = await supabase
        .from("notifications")
        .update({ status: "failed", error_message: errorMessage })
        .eq("meta_message_id", messageId);

      if (notificationError) {
        console.error("[whatsapp-meta-webhook] Error updating notifications status:", notificationError);
      }
    }

    if ((!updatedMessages || updatedMessages.length === 0)) {
      console.log(`[whatsapp-meta-webhook] No whatsapp_messages row found for meta_message_id ${messageId} (status ${status.status})`);
    }
  }
}

async function handleIncomingMessages(supabase: SupabaseClient, phoneNumberId: string | undefined, messages: MetaIncomingMessage[]) {
  if (!phoneNumberId) {
    console.log("[whatsapp-meta-webhook] Incoming messages without phone_number_id in metadata, skipping");
    return;
  }

  const { data: center, error: centerError } = await supabase
    .from("centers")
    .select("id, wasender_confirmation_reply")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();

  if (centerError || !center) {
    console.log(`[whatsapp-meta-webhook] No center found for phone_number_id ${phoneNumberId}`);
    return;
  }

  for (const msg of messages) {
    if (msg.type !== "text" || !msg.text?.body) {
      console.log(`[whatsapp-meta-webhook] Skipping non-text incoming message (type=${msg.type})`);
      continue;
    }

    const rawText = msg.text.body.trim();
    const messageText = rawText.toLowerCase();
    const fromPhone = msg.from || "";

    if (!fromPhone) continue;

    // Log every incoming message for traceability, regardless of whether it
    // ends up confirming a session.
    await supabase.from("whatsapp_messages").insert({
      center_id: center.id,
      phone: fromPhone,
      content: rawText,
      type: "text",
      direction: "incoming",
      message_type: "incoming",
      status: "delivered",
      meta_message_id: msg.id || null,
    });

    const isConfirmation = CONFIRMATION_KEYWORDS.some((kw) => messageText === kw || messageText.startsWith(kw));
    if (!isConfirmation) {
      console.log(`[whatsapp-meta-webhook] Message "${messageText}" is not a confirmation, skipping`);
      continue;
    }

    if (center.wasender_confirmation_reply === false) {
      console.log("[whatsapp-meta-webhook] Confirmation-by-reply disabled for this center, skipping");
      continue;
    }

    let cleanPhone = fromPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("34") && cleanPhone.length === 11) {
      cleanPhone = cleanPhone.slice(2);
    }

    const todayDate = new Date().toISOString().split("T")[0];
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: patients } = await supabase
      .from("patients")
      .select("id")
      .or(`phone.eq.${cleanPhone},phone.eq.+34${cleanPhone},phone.eq.34${cleanPhone}`);

    if (!patients || patients.length === 0) {
      console.log(`[whatsapp-meta-webhook] No patient found for phone ${cleanPhone}`);
      continue;
    }

    const patientIds = patients.map((p: { id: string }) => p.id);

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, session_date, start_time, end_time, status, center_id, patient_id, professional_id, google_calendar_event_id")
      .in("patient_id", patientIds)
      .eq("status", "scheduled")
      .gte("session_date", todayDate)
      .lte("session_date", in48h)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      console.log(`[whatsapp-meta-webhook] No upcoming scheduled session found for patient(s) ${patientIds.join(", ")}`);
      continue;
    }

    const targetSession = sessions[0];

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .eq("id", targetSession.id);

    if (updateError) {
      console.error("[whatsapp-meta-webhook] Error confirming session:", updateError);
      continue;
    }

    console.log(`[whatsapp-meta-webhook] Session ${targetSession.id} confirmed by patient via WhatsApp (Meta)`);

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
          console.error("[whatsapp-meta-webhook] Error syncing confirmation to Google Calendar:", gcalError);
        }
      } catch (gcalErr) {
        console.error("[whatsapp-meta-webhook] Exception syncing confirmation to Google Calendar:", gcalErr);
      }
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("WHATSAPP_META_WEBHOOK_VERIFY_TOKEN");

    if (!expectedToken) {
      console.error("[whatsapp-meta-webhook] WHATSAPP_META_WEBHOOK_VERIFY_TOKEN not configured");
      return new Response("Webhook not configured", { status: 500 });
    }

    if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
      console.log("[whatsapp-meta-webhook] Verification successful");
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    console.warn("[whatsapp-meta-webhook] Verification failed", { mode });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const appSecret = Deno.env.get("WHATSAPP_META_APP_SECRET");
    const rawBody = await req.text();

    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      const isValid = await verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        console.warn("[whatsapp-meta-webhook] Invalid signature, rejecting request");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Should never happen in production - the secret must be configured
      // before Meta is pointed at this endpoint, otherwise anyone could post
      // fabricated status/message events here.
      console.error("[whatsapp-meta-webhook] WHATSAPP_META_APP_SECRET not configured, rejecting request");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value: MetaChangeValue = change.value || {};

        if (value.statuses?.length) {
          console.log(`[whatsapp-meta-webhook] Processing ${value.statuses.length} status event(s)`);
          await handleStatuses(supabase, value.statuses);
        }

        if (value.messages?.length) {
          console.log(`[whatsapp-meta-webhook] Processing ${value.messages.length} incoming message(s)`);
          await handleIncomingMessages(supabase, value.metadata?.phone_number_id, value.messages);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[whatsapp-meta-webhook] Unhandled error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

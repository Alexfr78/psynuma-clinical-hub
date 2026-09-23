import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://www.wasenderapi.com/api";
const MIN_DELAY_MS = 3000; // Minimum 3 seconds between messages
const MAX_DELAY_MS = 5000; // Maximum 5 seconds between messages

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(): number {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[wasender-process-queue] CRON_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Function not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");

    if (!wasenderToken) {
      return new Response(JSON.stringify({ error: "WasenderAPI token not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get pending queue items (oldest first)
    const { data: queueItems, error: queueError } = await supabase
      .from("whatsapp_queue")
      .select(`
        id,
        center_id,
        message_id,
        attempts,
        max_attempts,
        next_retry_at,
        status,
        whatsapp_messages (
          id,
          phone,
          content,
          type,
          media_url,
          status
        )
      `)
      .is("processed_at", null)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (queueError) {
      console.error("Error fetching queue:", queueError);
      return new Response(JSON.stringify({ error: "Error fetching queue" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No items in queue" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const item of queueItems) {
      // Check for emergency stop on this center
      const { data: center } = await supabase
        .from("centers")
        .select("wasender_emergency_stop, wasender_enabled")
        .eq("id", item.center_id)
        .single();

      if (center?.wasender_emergency_stop || !center?.wasender_enabled) {
        console.log(`Skipping message for center ${item.center_id} - emergency stop or disabled`);
        await supabase
          .from("whatsapp_queue")
          .update({ status: "completed", processed_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
      }

      // Get the session for this center
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("wasender_session_id, status, api_key")
        .eq("center_id", item.center_id)
        .single();

      if (!session?.wasender_session_id || session.status !== "connected") {
        console.log(`Session not connected for center ${item.center_id}`);
        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = item.max_attempts || 3;
        const retryAt = new Date(Date.now() + 60000).toISOString();
        await supabase
          .from("whatsapp_queue")
          .update({ 
            attempts,
            next_retry_at: retryAt,
            scheduled_at: retryAt,
            status: attempts >= maxAttempts ? "failed" : "pending",
            ...(attempts >= maxAttempts ? { processed_at: new Date().toISOString(), error_message: "WhatsApp session not connected" } : {}),
          })
          .eq("id", item.id);
        failed++;
        continue;
      }

      const message = item.whatsapp_messages;
      if (!message || message.status === "sent") {
        await supabase
          .from("whatsapp_queue")
          .update({ status: "completed", processed_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
      }

      try {
        // Keep this endpoint and payload aligned with wasender-send-message.
        const messageBody = {
          to: message.phone,
          text: message.content,
        };
        const sendToken = session.api_key || wasenderToken;

        // Send via WasenderAPI - correct endpoint
        const sendResponse = await fetch(
          `${WASENDER_API_URL}/send-message`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${sendToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messageBody),
          }
        );

        const sendResult = await sendResponse.json();

        if (sendResponse.ok && sendResult.success !== false) {
          // Update message status
          await supabase
            .from("whatsapp_messages")
            .update({
              status: "sent",
              wasender_message_id: sendResult.data?.id || sendResult.message_id,
              sent_at: new Date().toISOString(),
            })
            .eq("id", message.id);

          // Mark queue item as processed
          await supabase
            .from("whatsapp_queue")
            .update({ status: "completed", processed_at: new Date().toISOString() })
            .eq("id", item.id);

          processed++;
        } else {
          // Handle failure with exponential backoff
          const attempts = (item.attempts || 0) + 1;
          const maxAttempts = item.max_attempts || 3;
          const backoffMs = Math.min(60000 * Math.pow(2, attempts), 3600000); // Max 1 hour
          const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

          if (attempts >= maxAttempts) {
            // Mark as failed after the row's configured number of attempts.
            await supabase
              .from("whatsapp_messages")
              .update({
                status: "failed",
                error_message: sendResult.message || sendResult.error || "Max retries exceeded",
              })
              .eq("id", message.id);

            await supabase
              .from("whatsapp_queue")
              .update({
                status: "failed",
                attempts,
                next_retry_at: nextRetryAt,
                processed_at: new Date().toISOString(),
                error_message: sendResult.message || sendResult.error || "Max retries exceeded",
              })
              .eq("id", item.id);
          } else {
            await supabase
              .from("whatsapp_queue")
              .update({
                status: "pending",
                attempts,
                next_retry_at: nextRetryAt,
                scheduled_at: nextRetryAt,
                error_message: sendResult.message || sendResult.error || null,
              })
              .eq("id", item.id);
          }
          failed++;
        }
      } catch (sendError) {
        console.error(`Error sending message ${message.id}:`, sendError);
        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = item.max_attempts || 3;
        const backoffMs = Math.min(60000 * Math.pow(2, attempts), 3600000);
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

        await supabase
          .from("whatsapp_queue")
          .update({
            status: attempts >= maxAttempts ? "failed" : "pending",
            attempts,
            next_retry_at: nextRetryAt,
            scheduled_at: nextRetryAt,
            processed_at: attempts >= maxAttempts ? new Date().toISOString() : null,
            error_message: (sendError as Error).message || "WasenderAPI request failed",
          })
          .eq("id", item.id);

        if (attempts >= maxAttempts) {
          await supabase
            .from("whatsapp_messages")
            .update({
              status: "failed",
              error_message: (sendError as Error).message || "Max retries exceeded",
            })
            .eq("id", message.id);
        }
        failed++;
      }

      // Rate limiting: wait between messages
      await sleep(getRandomDelay());
    }

    return new Response(JSON.stringify({
      processed,
      failed,
      total: queueItems.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[wasender-process-queue] Unhandled error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
        retry_count,
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
      .lte("scheduled_at", new Date().toISOString())
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
          .update({ processed_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
      }

      // Get the session for this center
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("wasender_session_id, status")
        .eq("center_id", item.center_id)
        .single();

      if (!session?.wasender_session_id || session.status !== "connected") {
        console.log(`Session not connected for center ${item.center_id}`);
        // Increment retry count
        await supabase
          .from("whatsapp_queue")
          .update({ 
            retry_count: (item.retry_count || 0) + 1,
            scheduled_at: new Date(Date.now() + 60000).toISOString(), // Retry in 1 minute
          })
          .eq("id", item.id);
        failed++;
        continue;
      }

      const message = item.whatsapp_messages;
      if (!message || message.status === "sent") {
        await supabase
          .from("whatsapp_queue")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
      }

      try {
        // Build message body
        let messageBody: Record<string, unknown>;
        
        if (message.type === "image" && message.media_url) {
          messageBody = {
            to: message.phone,
            media_url: message.media_url,
            caption: message.content,
          };
        } else {
          messageBody = {
            to: message.phone,
            text: message.content,
          };
        }

        // Send via WasenderAPI - correct endpoint
        const sendResponse = await fetch(
          `${WASENDER_API_URL}/whatsapp-sessions/${session.wasender_session_id}/messages/text`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${wasenderToken}`,
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
            .update({ processed_at: new Date().toISOString() })
            .eq("id", item.id);

          processed++;
        } else {
          // Handle failure with exponential backoff
          const retryCount = (item.retry_count || 0) + 1;
          const backoffMs = Math.min(60000 * Math.pow(2, retryCount), 3600000); // Max 1 hour

          if (retryCount >= 5) {
            // Mark as failed after 5 retries
            await supabase
              .from("whatsapp_messages")
              .update({
                status: "failed",
                error_message: sendResult.message || sendResult.error || "Max retries exceeded",
              })
              .eq("id", message.id);

            await supabase
              .from("whatsapp_queue")
              .update({ processed_at: new Date().toISOString() })
              .eq("id", item.id);
          } else {
            await supabase
              .from("whatsapp_queue")
              .update({
                retry_count: retryCount,
                scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
              })
              .eq("id", item.id);
          }
          failed++;
        }
      } catch (sendError) {
        console.error(`Error sending message ${message.id}:`, sendError);
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

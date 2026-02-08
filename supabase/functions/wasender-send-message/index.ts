import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://www.wasenderapi.com/api";

interface SendMessagePayload {
  phone: string;
  message: string;
  type?: "text" | "image" | "template";
  image_url?: string;
  caption?: string;
  template_variables?: Record<string, string>;
  patient_id?: string;
  session_id?: string;
  message_type?: string;
}

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

    const payload: SendMessagePayload = await req.json();
    const { phone, message, type = "text", image_url, caption, patient_id, session_id, message_type } = payload;

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "Phone and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active session
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("wasender_session_id, status")
      .eq("center_id", profile.center_id)
      .single();

    if (!session?.wasender_session_id || session.status !== "connected") {
      return new Response(JSON.stringify({ 
        error: "WhatsApp session not connected",
        code: "SESSION_NOT_CONNECTED"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format phone number (remove + and spaces)
    const formattedPhone = phone.replace(/[\s+\-()]/g, "");

    // Create message record first
    const { data: messageRecord, error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        center_id: profile.center_id,
        phone: formattedPhone,
        content: message,
        type,
        message_type: message_type || "manual",
        patient_id,
        session_id,
        status: "queued",
        media_url: image_url,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating message record:", insertError);
      return new Response(JSON.stringify({ error: "Error creating message record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add to queue for rate-limited processing
    const { error: queueError } = await supabase
      .from("whatsapp_queue")
      .insert({
        center_id: profile.center_id,
        message_id: messageRecord.id,
        scheduled_at: new Date().toISOString(),
      });

    if (queueError) {
      console.error("Error adding to queue:", queueError);
    }

    // For immediate sending (bypassing queue for single messages)
    // Check if queue is empty or this is a priority message
    try {
      // Build message body based on type
      let messageBody: Record<string, unknown>;
      
      if (type === "image" && image_url) {
        messageBody = {
          to: formattedPhone,
          media_url: image_url,
          caption: caption || message,
        };
      } else {
        messageBody = {
          to: formattedPhone,
          text: message,
        };
      }

      // Send via WasenderAPI - use the correct endpoint
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
      console.log("WasenderAPI send result:", sendResult);

      if (sendResponse.ok && sendResult.success !== false) {
        // Update message status
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "sent",
            wasender_message_id: sendResult.data?.id || sendResult.message_id,
            sent_at: new Date().toISOString(),
          })
          .eq("id", messageRecord.id);

        // Mark queue item as processed
        await supabase
          .from("whatsapp_queue")
          .update({ processed_at: new Date().toISOString() })
          .eq("message_id", messageRecord.id);

        return new Response(JSON.stringify({
          success: true,
          message_id: messageRecord.id,
          wasender_id: sendResult.data?.id || sendResult.message_id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Update message as failed
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "failed",
            error_message: sendResult.message || sendResult.error || "Unknown error",
          })
          .eq("id", messageRecord.id);

        return new Response(JSON.stringify({
          success: false,
          error: sendResult.message || sendResult.error || "Failed to send message",
          message_id: messageRecord.id,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (sendError) {
      console.error("Error sending message:", sendError);
      
      // Update message as failed
      await supabase
        .from("whatsapp_messages")
        .update({
          status: "failed",
          error_message: sendError.message,
        })
        .eq("id", messageRecord.id);

      return new Response(JSON.stringify({
        success: false,
        error: sendError.message,
        message_id: messageRecord.id,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

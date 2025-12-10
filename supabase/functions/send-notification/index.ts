import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  notificationId?: string;
  processScheduled?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { notificationId, processScheduled } = await req.json() as NotificationRequest;

    let notifications;

    if (notificationId) {
      // Send specific notification
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (error) throw error;
      notifications = [data];
    } else if (processScheduled) {
      // Process all pending scheduled notifications
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString());

      if (error) throw error;
      notifications = data;
    } else {
      throw new Error("notificationId or processScheduled required");
    }

    const results = [];

    for (const notification of notifications) {
      try {
        let success = false;
        let errorMessage = null;

        switch (notification.type) {
          case "email":
            // TODO: Integrate with email service (Resend, SendGrid, etc.)
            // For now, simulate sending
            console.log(`Sending email to ${notification.recipient}: ${notification.subject}`);
            success = true;
            break;

          case "sms":
            // TODO: Integrate with Twilio for SMS
            // const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
            // const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
            // const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
            console.log(`Sending SMS to ${notification.recipient}: ${notification.message}`);
            success = true;
            break;

          case "whatsapp":
            // TODO: Integrate with WhatsApp Cloud API
            // const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
            // const whatsappPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
            console.log(`Sending WhatsApp to ${notification.recipient}: ${notification.message}`);
            success = true;
            break;

          default:
            errorMessage = `Unknown notification type: ${notification.type}`;
        }

        // Update notification status
        const { error: updateError } = await supabase
          .from("notifications")
          .update({
            status: success ? "sent" : "failed",
            sent_at: success ? new Date().toISOString() : null,
            error_message: errorMessage,
          })
          .eq("id", notification.id);

        if (updateError) throw updateError;

        results.push({
          id: notification.id,
          type: notification.type,
          recipient: notification.recipient,
          success,
          error: errorMessage,
        });
      } catch (notifError) {
        const errorMsg = notifError instanceof Error ? notifError.message : 'Unknown error';
        // Update as failed
        await supabase
          .from("notifications")
          .update({
            status: "failed",
            error_message: errorMsg,
          })
          .eq("id", notification.id);

        results.push({
          id: notification.id,
          type: notification.type,
          recipient: notification.recipient,
          success: false,
          error: errorMsg,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = "https://www.wasenderapi.com/api";

interface SessionWithPatient {
  id: string;
  session_date: string;
  start_time: string;
  session_type: string;
  professional_id: string;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
  professional: {
    first_name: string;
    last_name: string;
  };
  center: {
    id: string;
    name: string;
    wasender_enabled: boolean;
    wasender_emergency_stop: boolean;
    wasender_reminder_24h: boolean;
    wasender_reminder_2h: boolean;
  };
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

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Get sessions that need 24h reminder
    const sessions24h = await getSessions(supabase, in24Hours, 'reminder_24h');
    
    // Get sessions that need 2h reminder
    const sessions2h = await getSessions(supabase, in2Hours, 'reminder_2h');

    let sent24h = 0;
    let sent2h = 0;

    // Process 24h reminders
    for (const session of sessions24h) {
      if (!session.center.wasender_enabled || 
          session.center.wasender_emergency_stop ||
          !session.center.wasender_reminder_24h) {
        continue;
      }

      const sent = await sendReminder(supabase, wasenderToken, session, 'reminder_24h');
      if (sent) sent24h++;
    }

    // Process 2h reminders
    for (const session of sessions2h) {
      if (!session.center.wasender_enabled || 
          session.center.wasender_emergency_stop ||
          !session.center.wasender_reminder_2h) {
        continue;
      }

      const sent = await sendReminder(supabase, wasenderToken, session, 'reminder_2h');
      if (sent) sent2h++;
    }

    return new Response(JSON.stringify({
      success: true,
      reminders_24h: sent24h,
      reminders_2h: sent2h,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[wasender-send-reminders] Unhandled error:", error);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getSessions(supabase: SupabaseClient, targetTime: Date, reminderType: string): Promise<SessionWithPatient[]> {
  const targetDateStr = targetTime.toISOString().split('T')[0];
  const targetHour = targetTime.getHours();
  const targetMinute = targetTime.getMinutes();
  
  // Window of 30 minutes for matching
  const startTime = `${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;
  const endHour = targetMinute >= 30 ? targetHour + 1 : targetHour;
  const endMinute = (targetMinute + 30) % 60;
  const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      session_date,
      start_time,
      session_type,
      professional_id,
      patient:patients (
        id,
        first_name,
        last_name,
        phone
      ),
      professional:profiles!sessions_professional_id_fkey (
        first_name,
        last_name
      ),
      center:centers (
        id,
        name,
        wasender_enabled,
        wasender_emergency_stop,
        wasender_reminder_24h,
        wasender_reminder_2h
      )
    `)
    .eq('session_date', targetDateStr)
    .gte('start_time', startTime)
    .lt('start_time', endTime)
    .eq('status', 'scheduled')
    .not('patient.phone', 'is', null);

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  // Filter out sessions that already received this reminder.
  // The untyped Supabase client can't infer that patient/professional/center
  // are to-one relations here, so it types them as arrays; cast to the real
  // (single-object) runtime shape returned by PostgREST for these FK joins.
  const sessionsWithReminders: SessionWithPatient[] = [];
  for (const session of (data || []) as unknown as SessionWithPatient[]) {
    if (!session.patient?.phone) continue;

    // Check if reminder was already sent
    const { data: existingReminder } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('session_id', session.id)
      .eq('message_type', reminderType)
      .maybeSingle();

    if (!existingReminder) {
      sessionsWithReminders.push(session);
    }
  }

  return sessionsWithReminders;
}

async function sendReminder(
  supabase: SupabaseClient,
  wasenderToken: string,
  session: SessionWithPatient, 
  reminderType: string
): Promise<boolean> {
  try {
    // Get WhatsApp session for this center
    const { data: whatsappSession } = await supabase
      .from('whatsapp_sessions')
      .select('wasender_session_id, status, api_key')
      .eq('center_id', session.center.id)
      .single();

    if (!whatsappSession?.wasender_session_id || whatsappSession.status !== 'connected') {
      console.log(`WhatsApp not connected for center ${session.center.id}`);
      return false;
    }

    // Format phone
    const phone = session.patient.phone.replace(/[\s+\-()]/g, '');
    
    // Build message
    const patientName = session.patient.first_name;
    const professionalName = `${session.professional.first_name} ${session.professional.last_name}`;
    const date = new Date(session.session_date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = session.start_time.substring(0, 5);

    const isReminder24h = reminderType === 'reminder_24h';
    const message = isReminder24h
      ? `Hola ${patientName}, te recordamos que mañana ${date} a las ${time} tienes tu cita con ${professionalName}. ¡Te esperamos!`
      : `Hola ${patientName}, te recordamos que en 2 horas (${time}) tienes tu cita con ${professionalName}. ¡Te esperamos!`;

    // Create message record
    const { data: messageRecord, error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert({
        center_id: session.center.id,
        phone,
        content: message,
        type: 'text',
        message_type: reminderType,
        patient_id: session.patient.id,
        session_id: session.id,
        status: 'queued',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating message record:', insertError);
      return false;
    }

    // Add to queue
    await supabase
      .from('whatsapp_queue')
      .insert({
        center_id: session.center.id,
        message_id: messageRecord.id,
        scheduled_at: new Date().toISOString(),
      });

    // Send immediately via /api/send-message with session API key
    const sendToken = whatsappSession.api_key || wasenderToken;
    const sendResponse = await fetch(
      `${WASENDER_API_URL}/send-message`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: `+${phone}`,
          text: message,
        }),
      }
    );

    // Validate JSON response before parsing
    const contentType = sendResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const textResponse = await sendResponse.text();
      console.error("WasenderAPI returned non-JSON response:", textResponse.substring(0, 500));
      
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_message: `WasenderAPI error: ${sendResponse.status} - Invalid response format`,
        })
        .eq('id', messageRecord.id);

      return false;
    }

    const sendResult = await sendResponse.json();

    if (sendResponse.ok && sendResult.success !== false) {
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'sent',
          wasender_message_id: sendResult.data?.id || sendResult.message_id,
          sent_at: new Date().toISOString(),
        })
        .eq('id', messageRecord.id);

      await supabase
        .from('whatsapp_queue')
        .update({ processed_at: new Date().toISOString() })
        .eq('message_id', messageRecord.id);

      return true;
    } else {
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_message: sendResult.message || sendResult.error,
        })
        .eq('id', messageRecord.id);

      return false;
    }
  } catch (error) {
    console.error('Error sending reminder:', error);
    return false;
  }
}

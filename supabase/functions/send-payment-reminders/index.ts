import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[send-payment-reminders] CRON_SECRET not configured');
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[send-payment-reminders] Starting payment reminder check...');

    // Get all centers with reminder settings enabled
    const { data: centers, error: centersError } = await supabase
      .from('centers')
      .select('id, name, payment_reminder_enabled, payment_reminder_hours_after, payment_reminder_max_count, payment_reminder_interval_hours')
      .eq('payment_reminder_enabled', true);

    if (centersError) {
      console.error('[send-payment-reminders] Error fetching centers:', centersError);
      throw centersError;
    }

    console.log(`[send-payment-reminders] Found ${centers?.length || 0} centers with reminders enabled`);

    let totalReminders = 0;

    for (const center of centers || []) {
      const hoursAfter = center.payment_reminder_hours_after || 24;
      const maxReminders = center.payment_reminder_max_count || 3;
      const intervalHours = center.payment_reminder_interval_hours || 48;

      // Calculate the cutoff time for sessions that should get reminders
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - (hoursAfter * 60 * 60 * 1000));

      // Get completed sessions that:
      // 1. Are completed
      // 2. Have payment_status = 'pending' or 'reminder_sent'
      // 3. Session date + time is before cutoff
      // 4. payment_reminder_count < max
      // 5. last_payment_reminder_at is null OR more than intervalHours ago
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          price,
          payment_status,
          payment_reminder_count,
          last_payment_reminder_at,
          patient_id,
          professional_id,
          patient:patients(id, first_name, last_name, email, phone),
          professional:profiles(id, first_name, last_name, email)
        `)
        .eq('center_id', center.id)
        .eq('status', 'completed')
        .in('payment_status', ['pending', 'reminder_sent'])
        .lt('payment_reminder_count', maxReminders)
        .gt('price', 0);

      if (sessionsError) {
        console.error(`[send-payment-reminders] Error fetching sessions for center ${center.id}:`, sessionsError);
        continue;
      }

      console.log(`[send-payment-reminders] Center ${center.name}: Found ${sessions?.length || 0} potential sessions`);

      for (const session of sessions || []) {
        // Check if session is old enough for reminder
        const sessionDateTime = new Date(`${session.session_date}T${session.end_time}`);
        if (sessionDateTime > cutoffTime) {
          console.log(`[send-payment-reminders] Session ${session.id} not old enough yet`);
          continue;
        }

        // Check if we should wait before sending another reminder
        if (session.last_payment_reminder_at) {
          const lastReminderTime = new Date(session.last_payment_reminder_at);
          const intervalMs = intervalHours * 60 * 60 * 1000;
          if (now.getTime() - lastReminderTime.getTime() < intervalMs) {
            console.log(`[send-payment-reminders] Session ${session.id} interval not elapsed`);
            continue;
          }
        }

        // Check if payment has been made
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount')
          .eq('session_id', session.id);

        const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        if (totalPaid >= Number(session.price)) {
          // Session is already paid, update status
          await supabase
            .from('sessions')
            .update({ payment_status: 'paid' })
            .eq('id', session.id);
          console.log(`[send-payment-reminders] Session ${session.id} already paid, updating status`);
          continue;
        }

        const patient = session.patient as any;
        const professional = session.professional as any;

        if (!patient?.email && !patient?.phone) {
          console.log(`[send-payment-reminders] Session ${session.id} patient has no contact info`);
          continue;
        }

        // Send reminder notification
        const reminderCount = (session.payment_reminder_count || 0) + 1;
        const remainingAmount = Number(session.price) - totalPaid;
        
        const message = `Hola ${patient.first_name}, te recordamos que tienes un pago pendiente de ${remainingAmount.toFixed(2)}€ correspondiente a tu sesión del ${session.session_date}. Por favor, realiza el pago a la mayor brevedad.`;

        // Create notification record and send
        const notificationType = patient.email ? 'email' : 'whatsapp';
        const { data: notifData, error: notifError } = await supabase
          .from('notifications')
          .insert({
            center_id: center.id,
            patient_id: patient.id,
            session_id: session.id,
            type: notificationType,
            recipient: patient.email || patient.phone,
            subject: 'Recordatorio de pago pendiente',
            message,
            status: 'pending',
          })
          .select()
          .single();

        if (notifError) {
          console.error(`[send-payment-reminders] Error creating notification for session ${session.id}:`, notifError);
          continue;
        }

        // Send notification via edge function (for email)
        if (notifData && notificationType === 'email') {
          try {
            const { error: sendError } = await supabase.functions.invoke('send-notification', {
              body: { notificationId: notifData.id },
            });
            if (sendError) {
              console.error(`[send-payment-reminders] Error sending notification ${notifData.id}:`, sendError);
            } else {
              console.log(`[send-payment-reminders] Email sent for notification ${notifData.id}`);
            }
          } catch (invokeError) {
            console.error(`[send-payment-reminders] Error invoking send-notification:`, invokeError);
          }
        }

        // Update session reminder tracking
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            payment_reminder_count: reminderCount,
            last_payment_reminder_at: now.toISOString(),
            payment_status: 'reminder_sent',
          })
          .eq('id', session.id);

        if (updateError) {
          console.error(`[send-payment-reminders] Error updating session ${session.id}:`, updateError);
          continue;
        }

        console.log(`[send-payment-reminders] Sent reminder ${reminderCount}/${maxReminders} for session ${session.id}`);
        totalReminders++;
      }
    }

    console.log(`[send-payment-reminders] Completed. Sent ${totalReminders} reminders total.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminders_sent: totalReminders,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-payment-reminders] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

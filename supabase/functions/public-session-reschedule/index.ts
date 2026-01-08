import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvailabilitySlot {
  startTime: string;
  endTime: string;
}

interface BookedSlot {
  start: string;
  end: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, token, date, newDate, newStartTime, newEndTime } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the session by access_token
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(`
        id,
        session_date,
        start_time,
        end_time,
        status,
        professional_id,
        location_id,
        center_id,
        patient_id,
        session_type,
        session_modality,
        cancellation_policy
      `)
      .eq("access_token", token)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("Session not found:", sessionError);
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get patient info
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email, phone")
      .eq("id", session.patient_id)
      .single();

    // Get center config
    const { data: center } = await supabase
      .from("centers")
      .select("name, reschedule_max_days, reschedule_slot_duration, reschedule_require_confirmation, admin_alerts_enabled, admin_alerts_events, admin_alerts_emails")
      .eq("id", session.center_id)
      .single();

    // Check if session can be rescheduled (not in the past, not cancelled)
    const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
    if (sessionDateTime < new Date()) {
      return new Response(
        JSON.stringify({ error: "Cannot reschedule past sessions" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "Cannot reschedule cancelled sessions" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const slotDuration = center?.reschedule_slot_duration || 60;
    const maxDays = center?.reschedule_max_days || 30;

    if (action === "get-available-days") {
      // Return list of dates that have at least some availability
      const today = new Date();
      const availableDays: string[] = [];

      for (let i = 0; i <= maxDays; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateStr = checkDate.toISOString().split("T")[0];

        const hasAvailability = await checkDayHasAvailability(
          supabase,
          session.professional_id,
          session.location_id,
          dateStr
        );

        if (hasAvailability) {
          availableDays.push(dateStr);
        }
      }

      return new Response(
        JSON.stringify({ availableDays, maxDays, slotDuration }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-availability") {
      if (!date) {
        return new Response(
          JSON.stringify({ error: "Date is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const slots = await getAvailability(
        supabase,
        session.professional_id,
        session.location_id,
        session.center_id,
        date,
        session.id,
        slotDuration
      );

      return new Response(
        JSON.stringify({ slots, maxDays, slotDuration }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reschedule") {
      if (!newDate || !newStartTime || !newEndTime) {
        return new Response(
          JSON.stringify({ error: "New date and times are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the slot is still available (anti-race-condition)
      const slots = await getAvailability(
        supabase,
        session.professional_id,
        session.location_id,
        session.center_id,
        newDate,
        session.id,
        slotDuration
      );

      const slotAvailable = slots.some(
        (s: AvailabilitySlot) => s.startTime === newStartTime && s.endTime === newEndTime
      );

      if (!slotAvailable) {
        return new Response(
          JSON.stringify({ error: "Selected slot is no longer available" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine the new status based on center configuration
      const requireConfirmation = center?.reschedule_require_confirmation ?? false;
      const newStatus = requireConfirmation ? "pending_approval" : "scheduled";

      // Update the session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          session_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          status: newStatus,
        })
        .eq("id", session.id);

      if (updateError) {
        console.error("Error updating session:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to reschedule session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send admin alert about the reschedule
      try {
        if (center?.admin_alerts_enabled && center.admin_alerts_emails) {
          const events = center.admin_alerts_events as string[] | null;
          if (events?.includes("session_rescheduled")) {
            const patientName = patient 
              ? `${patient.first_name} ${patient.last_name}`
              : "Paciente";

            const oldDate = new Date(session.session_date).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
            const oldTime = session.start_time.slice(0, 5);

            const formattedNewDate = new Date(newDate).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
            const formattedNewTime = newStartTime.slice(0, 5);

            await supabase.from("notifications").insert({
              center_id: session.center_id,
              patient_id: session.patient_id,
              session_id: session.id,
              type: "email",
              recipient: center.admin_alerts_emails,
              subject: `Cita reprogramada por ${patientName}`,
              message: `El paciente ${patientName} ha reprogramado su cita.\n\nFecha anterior: ${oldDate} a las ${oldTime}\nNueva fecha: ${formattedNewDate} a las ${formattedNewTime}`,
              status: "pending",
            });
          }
        }
      } catch (alertError) {
        console.error("Error sending admin alert:", alertError);
        // Don't fail the reschedule if alert fails
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          newStatus,
          message: requireConfirmation 
            ? "Reprogramación enviada para aprobación" 
            : "Cita reprogramada correctamente"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in public-session-reschedule:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getAvailability(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  centerId: string,
  date: string,
  excludeSessionId: string,
  slotDuration: number
): Promise<AvailabilitySlot[]> {
  const dayOfWeek = new Date(date).getDay();

  // Get professional availability for this day
  const { data: availability } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true);

  if (!availability || availability.length === 0) {
    return [];
  }

  // Get location schedule if location exists
  let locationSchedule: { start_time: string; end_time: string } | null = null;
  if (locationId) {
    const { data: schedule } = await supabase
      .from("location_schedules")
      .select("start_time, end_time")
      .eq("location_id", locationId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_open", true)
      .maybeSingle();
    locationSchedule = schedule;

    // If location exists but is closed on this day, return no slots
    if (!schedule) {
      return [];
    }
  }

  // Get existing sessions for this professional on this date (excluding current session)
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("session_date", date)
    .neq("id", excludeSessionId)
    .not("status", "in", '("cancelled","no_show")');

  const bookedSlots: BookedSlot[] = (existingSessions || []).map((s: { start_time: string; end_time: string }) => ({
    start: s.start_time,
    end: s.end_time,
  }));

  // Generate available slots
  const slots: AvailabilitySlot[] = [];
  const now = new Date();
  const isToday = date === now.toISOString().split("T")[0];

  for (const avail of availability as { start_time: string; end_time: string }[]) {
    let startTime = avail.start_time;
    let endTime = avail.end_time;

    // Intersect with location schedule if available
    if (locationSchedule) {
      if (locationSchedule.start_time > startTime) {
        startTime = locationSchedule.start_time;
      }
      if (locationSchedule.end_time < endTime) {
        endTime = locationSchedule.end_time;
      }
    }

    // Generate slots within this availability window
    let currentStart = startTime;
    while (currentStart < endTime) {
      const [hours, minutes] = currentStart.split(":").map(Number);
      const slotStartMinutes = hours * 60 + minutes;
      const slotEndMinutes = slotStartMinutes + slotDuration;
      const slotEnd = `${Math.floor(slotEndMinutes / 60).toString().padStart(2, "0")}:${(slotEndMinutes % 60).toString().padStart(2, "0")}:00`;

      // Check if slot end is within availability
      if (slotEnd > endTime) break;

      // Check if slot is not booked
      const isBooked = bookedSlots.some((booked) => {
        const bookedStart = booked.start;
        const bookedEnd = booked.end;
        return currentStart < bookedEnd && slotEnd > bookedStart;
      });

      // Check if slot is in the future (for today)
      let isInFuture = true;
      if (isToday) {
        const slotDateTime = new Date(`${date}T${currentStart}`);
        isInFuture = slotDateTime > now;
      }

      if (!isBooked && isInFuture) {
        slots.push({
          startTime: currentStart,
          endTime: slotEnd,
        });
      }

      // Move to next slot
      const nextMinutes = slotStartMinutes + slotDuration;
      currentStart = `${Math.floor(nextMinutes / 60).toString().padStart(2, "0")}:${(nextMinutes % 60).toString().padStart(2, "0")}:00`;
    }
  }

  return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// Helper function to check if a day has any potential availability
async function checkDayHasAvailability(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  date: string
): Promise<boolean> {
  const dayOfWeek = new Date(date).getDay();

  // Check professional availability for this day
  const { data: availability } = await supabase
    .from("availability")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true)
    .limit(1);

  if (!availability || availability.length === 0) {
    return false;
  }

  // Check location schedule if location exists
  if (locationId) {
    const { data: schedule } = await supabase
      .from("location_schedules")
      .select("id")
      .eq("location_id", locationId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_open", true)
      .limit(1);

    if (!schedule || schedule.length === 0) {
      return false;
    }
  }

  return true;
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage, formatDateSpanish, formatTime } from "../_shared/adminAlerts.ts";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalByEmail, buildProfessionalCancelMessage, buildProfessionalRescheduleMessage } from "../_shared/professionalNotification.ts";

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

    const { action, token, date, newDate, newStartTime, newEndTime, cancellation_reason } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the session by access_token - include google_calendar_event_id for sync
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
        cancellation_policy,
        google_calendar_event_id
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

    // Get professional info
    const { data: professional } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", session.professional_id)
      .single();

    // Get center config
    const { data: center } = await supabase
      .from("centers")
      .select("name, reschedule_max_days, reschedule_slot_duration, reschedule_require_confirmation")
      .eq("id", session.center_id)
      .single();

    // Get location info if exists, or infer from session modality
    let locationName = null;
    let effectiveLocationId = session.location_id;
    
    if (session.location_id) {
      const { data: location } = await supabase
        .from("center_locations")
        .select("name")
        .eq("id", session.location_id)
        .single();
      locationName = location?.name;
    } else if (session.session_modality) {
      // Infer location from session modality when location_id is not set
      const locationType = session.session_modality === 'zoom' || session.session_modality === 'google_meet' 
        ? 'online' 
        : session.session_modality === 'in_person' 
          ? 'in_person' 
          : null;
      
      if (locationType) {
        const { data: inferredLocation } = await supabase
          .from("center_locations")
          .select("id, name")
          .eq("center_id", session.center_id)
          .eq("location_type", locationType)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        
        if (inferredLocation) {
          effectiveLocationId = inferredLocation.id;
          locationName = inferredLocation.name;
          console.log(`[RESCHEDULE] Inferred location ${inferredLocation.name} (${locationType}) for session modality ${session.session_modality}`);
        }
      }
    }

    // Check if session can be rescheduled (not in the past, not cancelled)
    const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
    if (sessionDateTime < new Date()) {
      return new Response(
        JSON.stringify({ error: "Cannot modify past sessions" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "Cannot modify cancelled sessions" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxDays = center?.reschedule_max_days || 30;

    // Calculate session duration from the original session's start and end times
    const [startHours, startMinutes] = session.start_time.split(":").map(Number);
    const [endHours, endMinutes] = session.end_time.split(":").map(Number);
    const sessionDuration = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);

    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : "Paciente";
    const professionalName = professional ? `${professional.first_name} ${professional.last_name}` : undefined;

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
          effectiveLocationId,
          dateStr,
          sessionDuration,
          session.id // Exclude current session when checking availability
        );

        if (hasAvailability) {
          availableDays.push(dateStr);
        }
      }

      return new Response(
        JSON.stringify({ availableDays, maxDays, sessionDuration }),
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
        effectiveLocationId,
        session.center_id,
        date,
        session.id,
        sessionDuration
      );

      return new Response(
        JSON.stringify({ slots, maxDays, sessionDuration }),
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
        effectiveLocationId,
        session.center_id,
        newDate,
        session.id,
        sessionDuration
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
      console.log(`[RESCHEDULE] Attempting to update session ${session.id} from ${session.session_date} ${session.start_time} to ${newDate} ${newStartTime}`);
      
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          session_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          status: newStatus,
        })
        .eq("id", session.id)
        .select("id, session_date, start_time, status")
        .single();

      if (updateError) {
        console.error("[RESCHEDULE] Error updating session:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to reschedule session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[RESCHEDULE] Session updated successfully:`, updatedSession);

      // Sync the changes to Google Calendar if session has a Google event
      if (session.google_calendar_event_id) {
        try {
          console.log(`[RESCHEDULE] Syncing reschedule to Google Calendar event ${session.google_calendar_event_id}`);
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          
          const googleSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              professional_id: session.professional_id,
              event_id: session.google_calendar_event_id,
              psycma_session_id: session.id,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              title: `${session.session_type || 'Sesión'} - ${patientName}`,
              create_if_not_exists: true, // Create if somehow deleted from Google
            }),
          });
          
          const googleSyncResult = await googleSyncResponse.json();
          
          if (googleSyncResult.success) {
            console.log(`[RESCHEDULE] Google Calendar synced successfully:`, googleSyncResult);
            
            // If event was recreated with new ID, update session
            if (googleSyncResult.event_id && googleSyncResult.event_id !== session.google_calendar_event_id) {
              await supabase
                .from("sessions")
                .update({ google_calendar_event_id: googleSyncResult.event_id })
                .eq("id", session.id);
              console.log(`[RESCHEDULE] Updated session with new Google event ID: ${googleSyncResult.event_id}`);
            }
          } else {
            console.error(`[RESCHEDULE] Google Calendar sync failed:`, googleSyncResult);
          }
        } catch (googleError) {
          console.error("[RESCHEDULE] Error syncing to Google Calendar:", googleError);
          // Don't fail the reschedule if Google sync fails
        }
      } else {
        console.log(`[RESCHEDULE] Session ${session.id} has no Google Calendar event, skipping sync`);
      }

      // Send admin alert about the reschedule using the helper
      try {
        const alertMessage = buildAlertMessage({
          eventType: "Cita reprogramada por el paciente",
          patientName,
          patientEmail: patient?.email,
          patientPhone: patient?.phone,
          professionalName,
          modality: session.session_modality,
          locationName,
          oldDate: session.session_date,
          oldTime: session.start_time,
          newDate,
          newTime: newStartTime,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.center_id,
          eventKey: "booking_rescheduled",
          subject: `Cita reprogramada por ${patientName}`,
          message: alertMessage,
          patientId: session.patient_id,
          sessionId: session.id,
          professionalId: session.professional_id,
        });
      } catch (alertError) {
        console.error("Error sending admin alert:", alertError);
        // Don't fail the reschedule if alert fails
      }

      // Send direct email to professional (independent of admin alerts)
      await notifyProfessionalByEmail({
        supabase,
        centerId: session.center_id,
        professionalId: session.professional_id,
        patientId: session.patient_id,
        sessionId: session.id,
        subject: `Cita reprogramada - ${patientName} - ${newDate}`,
        message: buildProfessionalRescheduleMessage({
          patientName,
          oldDate: session.session_date,
          oldTime: session.start_time,
          newDate,
          newTime: newStartTime,
        }),
      });

      // Send patient reschedule notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.center_id,
        patientId: session.patient_id,
        sessionId: session.id,
        eventType: 'rescheduled',
        sessionDate: newDate,
        startTime: newStartTime,
        sessionType: session.session_type,
        sessionModality: session.session_modality,
        locationName: locationName || undefined,
        oldDate: session.session_date,
        oldTime: session.start_time,
      });

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

    if (action === "cancel") {
      // Check cancellation policy
      const policy = session.cancellation_policy || "24_hours";
      const hoursUntilSession = (sessionDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
      
      const policyHoursMap: Record<string, number> = {
        "not_allowed": Infinity,
        "until_start": 0,
        "1_hour": 1,
        "2_hours": 2,
        "24_hours": 24,
        "48_hours": 48,
        "72_hours": 72,
      };
      
      const requiredHours = policyHoursMap[policy] ?? 24;
      
      if (requiredHours === Infinity) {
        return new Response(
          JSON.stringify({ error: "No se permiten cancelaciones para esta cita" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (hoursUntilSession < requiredHours && requiredHours > 0) {
        return new Response(
          JSON.stringify({ error: `Las cancelaciones deben realizarse con al menos ${requiredHours} horas de antelación` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update the session status to cancelled
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          status: "cancelled",
          cancellation_reason: cancellation_reason || "Cancelada por el paciente",
        })
        .eq("id", session.id);

      if (updateError) {
        console.error("Error cancelling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to cancel session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sync the cancellation to Google Calendar if session has a Google event
      if (session.google_calendar_event_id) {
        try {
          console.log(`[CANCEL] Syncing cancellation to Google Calendar event ${session.google_calendar_event_id}`);
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          
          const googleSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              professional_id: session.professional_id,
              event_id: session.google_calendar_event_id,
              status: "cancelled",
            }),
          });
          
          const googleSyncResult = await googleSyncResponse.json();
          
          if (googleSyncResult.success) {
            console.log(`[CANCEL] Google Calendar event deleted successfully`);
          } else {
            console.error(`[CANCEL] Google Calendar sync failed:`, googleSyncResult);
          }
        } catch (googleError) {
          console.error("[CANCEL] Error syncing cancellation to Google Calendar:", googleError);
          // Don't fail the cancellation if Google sync fails
        }
      }

      // Send admin alert about the cancellation
      try {
        const alertMessage = buildAlertMessage({
          eventType: "Cita cancelada por el paciente",
          patientName,
          patientEmail: patient?.email,
          patientPhone: patient?.phone,
          sessionDate: session.session_date,
          sessionTime: session.start_time,
          professionalName,
          modality: session.session_modality,
          locationName,
          details: cancellation_reason || undefined,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.center_id,
          eventKey: "booking_cancelled",
          subject: `Cita cancelada por ${patientName}`,
          message: alertMessage,
          patientId: session.patient_id,
          sessionId: session.id,
          professionalId: session.professional_id,
        });
      } catch (alertError) {
        console.error("Error sending admin alert:", alertError);
        // Don't fail the cancellation if alert fails
      }

      // Send direct email to professional (independent of admin alerts)
      await notifyProfessionalByEmail({
        supabase,
        centerId: session.center_id,
        professionalId: session.professional_id,
        patientId: session.patient_id,
        sessionId: session.id,
        subject: `Cita cancelada - ${patientName} - ${session.session_date}`,
        message: buildProfessionalCancelMessage({
          patientName,
          sessionDate: session.session_date,
          sessionTime: session.start_time,
          reason: cancellation_reason || undefined,
        }),
      });

      // Send patient cancellation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.center_id,
        patientId: session.patient_id,
        sessionId: session.id,
        eventType: 'cancelled',
        sessionDate: session.session_date,
        startTime: session.start_time,
        sessionType: session.session_type,
        sessionModality: session.session_modality,
        locationName: locationName || undefined,
        reason: cancellation_reason || undefined,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Cita cancelada correctamente"
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

// Helper function to check if a day has any actual availability (including existing sessions check)
async function checkDayHasAvailability(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  date: string,
  sessionDuration: number,
  excludeSessionId?: string
): Promise<boolean> {
  const dayOfWeek = new Date(date).getDay();
  const now = new Date();
  const isToday = date === now.toISOString().split("T")[0];

  // Check professional availability for this day
  const { data: availability } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true);

  if (!availability || availability.length === 0) {
    return false;
  }

  // Check location schedule if location exists
  let locationSchedule: { start_time: string; end_time: string } | null = null;
  if (locationId) {
    const { data: schedule } = await supabase
      .from("location_schedules")
      .select("start_time, end_time")
      .eq("location_id", locationId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_open", true)
      .maybeSingle();

    if (!schedule) {
      return false;
    }
    locationSchedule = schedule;
  }

  // Get existing sessions for this day to check for conflicts
  let sessionsQuery = supabase
    .from("sessions")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("session_date", date)
    .not("status", "in", '("cancelled","no_show")');

  if (excludeSessionId) {
    sessionsQuery = sessionsQuery.neq("id", excludeSessionId);
  }

  const { data: existingSessions } = await sessionsQuery;

  const bookedSlots = (existingSessions || []).map((s: { start_time: string; end_time: string }) => ({
    start: s.start_time,
    end: s.end_time,
  }));

  // Check if there's at least one slot available
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

    // Try to find at least one available slot
    let currentStart = startTime;
    while (currentStart < endTime) {
      const [hours, minutes] = currentStart.split(":").map(Number);
      const slotStartMinutes = hours * 60 + minutes;
      const slotEndMinutes = slotStartMinutes + sessionDuration;
      const slotEnd = `${Math.floor(slotEndMinutes / 60).toString().padStart(2, "0")}:${(slotEndMinutes % 60).toString().padStart(2, "0")}:00`;

      // Check if slot end is within availability
      if (slotEnd > endTime) break;

      // Check if slot is not booked
      const isBooked = bookedSlots.some((booked: { start: string; end: string }) => {
        return currentStart < booked.end && slotEnd > booked.start;
      });

      // Check if slot is in the future (for today)
      let isInFuture = true;
      if (isToday) {
        const slotDateTime = new Date(`${date}T${currentStart}`);
        isInFuture = slotDateTime > now;
      }

      if (!isBooked && isInFuture) {
        return true; // Found at least one available slot
      }

      // Move to next slot
      const nextMinutes = slotStartMinutes + sessionDuration;
      currentStart = `${Math.floor(nextMinutes / 60).toString().padStart(2, "0")}:${(nextMinutes % 60).toString().padStart(2, "0")}:00`;
    }
  }

  return false;
}

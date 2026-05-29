import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage, formatDateSpanish, formatTime } from "../_shared/adminAlerts.ts";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalBooking } from "../_shared/professionalNotification.ts";
import { resolveDayAvailability } from "../_shared/availability-core.ts";
import {
  buildDayScheduleInput,
  minutesToTime as coreMinutesToTime,
  APP_TZ,
} from "../_shared/special-days-adapter.ts";

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

    const {
      action,
      token,
      date,
      locationId: requestedLocationId,
      newDate,
      newStartTime,
      newEndTime,
      newLocationId,
      cancellation_reason,
    } = await req.json();

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

    // Helper: resolve & validate a requested location id (must belong to the same
    // center and be active+public). Returns the validated row or null on error.
    async function resolveRequestedLocation(locId: string | null | undefined) {
      if (!locId) return { row: null as any, error: null as string | null };
      const { data: loc, error } = await supabase
        .from("center_locations")
        .select("id, name, location_type, street, number_details, city, postal_code, is_active, is_public, center_id")
        .eq("id", locId)
        .eq("center_id", session.center_id)
        .maybeSingle();
      if (error || !loc) return { row: null, error: "Ubicación no encontrada" };
      if (!loc.is_active || !loc.is_public) return { row: null, error: "Ubicación no disponible" };
      return { row: loc, error: null };
    }

    if (action === "get-locations") {
      const { data: rows, error: locErr } = await supabase
        .from("center_locations")
        .select("id, name, location_type, street, number_details, city, postal_code")
        .eq("center_id", session.center_id)
        .eq("is_active", true)
        .eq("is_public", true)
        .order("name");
      if (locErr) {
        return new Response(
          JSON.stringify({ error: "Error al obtener ubicaciones" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ locations: rows ?? [], originalLocationId: session.location_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve the location to use for availability/reschedule actions
    let resolvedLocationId = effectiveLocationId;
    if (requestedLocationId && requestedLocationId !== session.location_id) {
      const { row, error: locErr } = await resolveRequestedLocation(requestedLocationId);
      if (locErr) {
        return new Response(
          JSON.stringify({ error: locErr }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resolvedLocationId = row.id;
    }

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
          resolvedLocationId,
          dateStr,
          sessionDuration,
          session.id, // Exclude current session when checking availability
          session.center_id,
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
        resolvedLocationId,
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

      // Resolve target location (defaults to current). Validates same center + active + public.
      let targetLocation: any = null;
      let targetLocationId = effectiveLocationId;
      if (newLocationId) {
        const { row, error: locErr } = await resolveRequestedLocation(newLocationId);
        if (locErr) {
          return new Response(
            JSON.stringify({ error: locErr }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        targetLocation = row;
        targetLocationId = row.id;
      } else if (effectiveLocationId) {
        const { data: loc } = await supabase
          .from("center_locations")
          .select("id, name, location_type, street, number_details, city, postal_code")
          .eq("id", effectiveLocationId)
          .maybeSingle();
        targetLocation = loc;
      }

      // Compute new modality, preserving zoom/google_meet sub-types if both old and new are online.
      // If transitioning from in_person -> online, use the professional's default video provider.
      const prevModality = session.session_modality;
      let newModality: string | null = session.session_modality;
      const wasOnline = prevModality === 'zoom' || prevModality === 'google_meet' || prevModality === 'online';

      if (targetLocation) {
        if (targetLocation.location_type === 'online') {
          if (prevModality === 'zoom' || prevModality === 'google_meet') {
            newModality = prevModality;
          } else {
            // Resolve from professional's default provider
            const { data: profIntegrations } = await supabase
              .from('professional_integrations')
              .select('default_video_provider, zoom_enabled, google_meet_enabled')
              .eq('professional_id', session.professional_id)
              .maybeSingle();
            const def = profIntegrations?.default_video_provider;
            if (def === 'zoom' && profIntegrations?.zoom_enabled) newModality = 'zoom';
            else if (def === 'google_meet' && profIntegrations?.google_meet_enabled) newModality = 'google_meet';
            else if (profIntegrations?.zoom_enabled) newModality = 'zoom';
            else if (profIntegrations?.google_meet_enabled) newModality = 'google_meet';
            else newModality = 'online';
          }
        } else {
          newModality = 'in_person';
        }
      }
      const willBeOnline = newModality === 'zoom' || newModality === 'google_meet' || newModality === 'online';

      // Enforce cancellation/reschedule policy window (same rules apply to reschedule)
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
          JSON.stringify({ error: "Esta cita no se puede reprogramar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (hoursUntilSession < requiredHours && requiredHours > 0) {
        return new Response(
          JSON.stringify({ error: `La cita debe reprogramarse con al menos ${requiredHours} horas de antelación` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the slot is still available (anti-race-condition) USING THE TARGET LOCATION
      const slots = await getAvailability(
        supabase,
        session.professional_id,
        targetLocationId,
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

      // Final overlap check with row-level locking to prevent race conditions
      console.log(`[RESCHEDULE] Running final overlap check for ${newDate} ${newStartTime}-${newEndTime}`);
      
      const { data: overlapping, error: overlapError } = await supabase
        .from("sessions")
        .select("id, start_time, end_time")
        .eq("professional_id", session.professional_id)
        .eq("session_date", newDate)
        .neq("status", "cancelled")
        .neq("id", session.id)
        .lt("start_time", newEndTime)
        .gt("end_time", newStartTime);

      if (overlapError) {
        console.error("[RESCHEDULE] Error checking overlaps:", overlapError);
      }

      if (overlapping && overlapping.length > 0) {
        console.error(`[RESCHEDULE] Overlap detected with sessions: ${overlapping.map(s => s.id).join(', ')}`);
        return new Response(
          JSON.stringify({ error: "El horario seleccionado ya está ocupado por otra cita" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine the new status based on center configuration
      const requireConfirmation = center?.reschedule_require_confirmation ?? false;
      const newStatus = requireConfirmation ? "pending_approval" : "scheduled";

      // Update the session (date, time, status, location, modality)
      console.log(`[RESCHEDULE] Attempting to update session ${session.id} from ${session.session_date} ${session.start_time} to ${newDate} ${newStartTime} (location ${session.location_id} -> ${targetLocationId})`);

      const updatePayload: Record<string, any> = {
        session_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        status: newStatus,
      };
      if (targetLocationId) updatePayload.location_id = targetLocationId;
      if (newModality) updatePayload.session_modality = newModality;

      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", session.id)
        .select("id, session_date, start_time, status")
        .single();

      if (updateError) {
        console.error("[RESCHEDULE] Error updating session:", updateError);
        // Check if this is an overlap trigger error
        if (updateError.message?.includes('solapa') || updateError.message?.includes('overlap')) {
          return new Response(
            JSON.stringify({ error: "El horario seleccionado ya está ocupado por otra cita" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Failed to reschedule session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[RESCHEDULE] Session updated successfully:`, updatedSession);

      // Handle video meeting transitions
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // Case A: transition in_person -> online (zoom): create Zoom meeting
      if (!wasOnline && willBeOnline && newModality === 'zoom') {
        try {
          console.log(`[RESCHEDULE] Creating Zoom meeting for newly-online session ${session.id}`);
          const zoomResp = await fetch(`${supabaseUrl}/functions/v1/create-zoom-meeting`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': serviceKey,
            },
            body: JSON.stringify({
              professional_id: session.professional_id,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              topic: `Sesión de ${session.session_type || 'psicología'}`,
              patient_name: patientName,
            }),
          });
          const zoomData = await zoomResp.json();
          if (zoomResp.ok && zoomData?.join_url) {
            await supabase.from('sessions').update({
              video_call_link: zoomData.join_url,
              video_provider: 'zoom',
              zoom_meeting_id: String(zoomData.meeting_id),
              zoom_password: zoomData.password || null,
            }).eq('id', session.id);
            console.log(`[RESCHEDULE] Zoom meeting created: ${zoomData.meeting_id}`);
          } else {
            console.error(`[RESCHEDULE] Failed to create Zoom meeting:`, zoomData);
          }
        } catch (e) {
          console.error('[RESCHEDULE] Error creating Zoom meeting:', e);
        }
      }

      // Case B: transition online -> in_person: clear video fields (Google sync below will refresh event description)
      if (wasOnline && !willBeOnline) {
        await supabase.from('sessions').update({
          video_call_link: null,
          video_provider: null,
          zoom_meeting_id: null,
          zoom_password: null,
        }).eq('id', session.id);
        console.log(`[RESCHEDULE] Cleared video fields for in_person transition`);
      }


      // Build human-readable location string for the Google Calendar event
      function buildGcalLocationString(loc: any): string | undefined {
        if (!loc) return undefined;
        if (loc.location_type === 'online') return 'Sesión online';
        const street = loc.street ? `${loc.street}${loc.number_details ? ' ' + loc.number_details : ''}` : '';
        const tail = [loc.postal_code, loc.city].filter(Boolean).join(' ');
        const addr = [street, tail].filter(Boolean).join(', ');
        return addr ? `${loc.name} — ${addr}` : loc.name;
      }
      const gcalLocation = buildGcalLocationString(targetLocation);

      // Sync the changes to Google Calendar if session has a Google event
      if (session.google_calendar_event_id) {
        try {
          console.log(`[RESCHEDULE] Syncing reschedule to Google Calendar event ${session.google_calendar_event_id}`);



          const googleSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
              "apikey": serviceKey,
            },

            body: JSON.stringify({
              professional_id: session.professional_id,
              event_id: session.google_calendar_event_id,
              psycma_session_id: session.id,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              title: `${session.session_type || 'Sesión'} - ${patientName}`,
              location: gcalLocation,
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

      const newLocationName = targetLocation?.name || locationName;
      const locationChanged = !!newLocationId && newLocationId !== session.location_id;

      // Send admin alert about the reschedule using the helper
      try {
        const alertMessage = buildAlertMessage({
          eventType: locationChanged
            ? "Cita reprogramada por el paciente (cambio de ubicación)"
            : "Cita reprogramada por el paciente",
          patientName,
          patientEmail: patient?.email,
          patientPhone: patient?.phone,
          professionalName,
          modality: newModality || session.session_modality,
          locationName: newLocationName,
          oldDate: session.session_date,
          oldTime: session.start_time,
          newDate,
          newTime: newStartTime,
          details: locationChanged
            ? `Ubicación anterior: ${locationName || 'N/D'}. Nueva ubicación: ${newLocationName || 'N/D'}.`
            : undefined,
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

      // Notify professional (email or WhatsApp depending on center config)
      await notifyProfessionalBooking({
        supabase,
        centerId: session.center_id,
        professionalId: session.professional_id,
        patientId: session.patient_id,
        sessionId: session.id,
        eventType: 'rescheduled',
        sessionDate: newDate,
        startTime: newStartTime,
        sessionType: session.session_type,
        sessionModality: newModality || session.session_modality,
        locationName: newLocationName || undefined,
        oldDate: session.session_date,
        oldTime: session.start_time,
      });

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

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
        sessionModality: newModality || session.session_modality,
        locationName: newLocationName || undefined,
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
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

          const googleSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${anonKey}`,
              "apikey": serviceKey,
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

      // Notify professional (email or WhatsApp depending on center config)
      await notifyProfessionalBooking({
        supabase,
        centerId: session.center_id,
        professionalId: session.professional_id,
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

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

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

// Carga datos crudos para resolver disponibilidad de un día concreto.
// Reutilizado por getAvailability (devuelve slots) y checkDayHasAvailability
// (devuelve boolean), garantizando consistencia entre ambos caminos.
async function loadDayData(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  centerId: string,
  date: string,
  excludeSessionId?: string,
) {
  const dayOfWeek = new Date(date).getDay();

  const { data: availability } = await supabase
    .from("availability")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_available", true);

  let locationSchedules: { start_time: string; end_time: string; is_open: boolean | null }[] | null = null;
  if (locationId) {
    const { data: schedules } = await supabase
      .from("location_schedules")
      .select("start_time, end_time, is_open")
      .eq("location_id", locationId)
      .eq("day_of_week", dayOfWeek);
    locationSchedules = schedules ?? [];
  }

  let sessionsQuery = supabase
    .from("sessions")
    .select("id, start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("session_date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (excludeSessionId) sessionsQuery = sessionsQuery.neq("id", excludeSessionId);
  const { data: sessions } = await sessionsQuery;

  const dateStartIso = `${date}T00:00:00`;
  const dateEndIso = `${date}T23:59:59`;

  const { data: calendarEvents } = await supabase
    .from("calendar_events")
    .select("id, start_at, end_at, status, all_day, is_converted, deleted")
    .eq("professional_id", professionalId)
    .eq("is_converted", false)
    .eq("deleted", false)
    .lte("start_at", dateEndIso)
    .gte("end_at", dateStartIso);

  const { data: scheduleExceptions } = await supabase
    .from("schedule_exceptions")
    .select("id, scope, start_date, end_date, all_day, start_time, end_time, professional_id, affects_booking")
    .eq("center_id", centerId)
    .eq("affects_booking", true)
    .lte("start_date", date)
    .gte("end_date", date);

  const { data: specialDays } = await supabase
    .from("special_days")
    .select("id, scope, professional_id, type, start_date, end_date, affects_public_booking, created_at, special_day_slots(start_time, end_time)")
    .eq("center_id", centerId)
    .eq("affects_public_booking", true)
    .lte("start_date", date)
    .gte("end_date", date);

  return {
    weeklyAvailability: availability ?? [],
    locationSchedules,
    sessions: sessions ?? [],
    calendarEvents: calendarEvents ?? [],
    scheduleExceptions: scheduleExceptions ?? [],
    specialDays: specialDays ?? [],
  };
}

async function getAvailability(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  centerId: string,
  date: string,
  excludeSessionId: string,
  slotDuration: number
): Promise<AvailabilitySlot[]> {
  const data = await loadDayData(supabase, professionalId, locationId, centerId, date, excludeSessionId);

  const dayInput = buildDayScheduleInput({
    date,
    professionalId,
    isPublicContext: true,
    weeklyAvailability: data.weeklyAvailability,
    locationSchedules: data.locationSchedules,
    specialDays: data.specialDays as any,
    scheduleExceptions: data.scheduleExceptions as any,
    sessions: data.sessions as any,
    calendarEvents: data.calendarEvents as any,
    timezone: APP_TZ,
  });

  const resolved = resolveDayAvailability(dayInput, {
    durationMin: slotDuration,
    stepMin: slotDuration,
    minPublicDurationMin: slotDuration,
  });

  // Filtro de "futuro" para hoy.
  const now = new Date();
  const isToday = date === now.toISOString().split("T")[0];
  const nowMinutesLocal = isToday
    ? (() => {
        const fmt = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: APP_TZ,
        });
        const parts = fmt.formatToParts(now);
        const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
        return h * 60 + m;
      })()
    : -1;

  const slots: AvailabilitySlot[] = [];
  for (const s of resolved) {
    if (isToday && s.startMin <= nowMinutesLocal) continue;
    slots.push({
      startTime: `${coreMinutesToTime(s.startMin)}:00`,
      endTime: `${coreMinutesToTime(s.endMin)}:00`,
    });
  }
  return slots;
}

async function checkDayHasAvailability(
  supabase: any,
  professionalId: string,
  locationId: string | null,
  date: string,
  sessionDuration: number,
  excludeSessionId?: string,
  centerId?: string,
): Promise<boolean> {
  // Sin centerId no podemos consultar special_days/exceptions; se asume llamadas
  // siempre con centerId desde Fase 3b en adelante. Si falta, fallback conservador.
  if (!centerId) {
    console.warn("[checkDayHasAvailability] missing centerId — skipping special_days/exceptions");
  }

  const slots = await getAvailability(
    supabase,
    professionalId,
    locationId,
    centerId ?? "",
    date,
    excludeSessionId ?? "",
    sessionDuration,
  );
  return slots.length > 0;
}

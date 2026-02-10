import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage, formatDateSpanish, formatTime } from "../_shared/adminAlerts.ts";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalByEmail, buildProfessionalCancelMessage, buildProfessionalRescheduleMessage } from "../_shared/professionalNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use SUPABASE_SERVICE_ROLE_KEY as HMAC secret for verifying tokens
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Helper functions for time conversion
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Convert UTC timestamp to local time minutes for a given timezone
function getLocalTimeMinutes(isoDatetime: string, timezone: string): number {
  const date = new Date(isoDatetime);
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: timezone
  });
  const parts = formatter.formatToParts(date);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  return hours * 60 + minutes;
}

// Cryptographic token verification using HMAC-SHA256
async function validateSession(sessionToken: string): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) {
      return { valid: false };
    }
    
    const data = atob(payloadB64);
    const encoder = new TextEncoder();
    
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const signatureBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));
    
    if (!isValid) {
      console.error("Token signature verification failed");
      return { valid: false };
    }
    
    const payload = JSON.parse(data);
    
    // Check expiration
    if (payload.exp < Date.now()) {
      console.error("Token expired");
      return { valid: false };
    }
    
    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch (error) {
    console.error("Token validation error:", error);
    return { valid: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, sessionToken, ...params } = await req.json();

    // Validate session token cryptographically
    const session = await validateSession(sessionToken);
    if (!session.valid || !session.patientId) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      // Get ALL patient sessions (including cancelled for history)
      const { data: sessions, error } = await supabase
        .from("sessions")
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          status,
          session_type,
          session_modality,
          notes,
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          ),
          location:center_locations(
            id, name, street, city, location_type
          )
        `)
        .eq("patient_id", session.patientId)
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (error) {
        console.error("Error fetching sessions:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener las citas" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Separate into upcoming and past
      // Upcoming: future sessions that are NOT cancelled
      // Past: all past sessions (including cancelled ones for history)
      const today = new Date().toISOString().split("T")[0];
      const upcoming = sessions?.filter(s => s.session_date >= today && s.status !== 'cancelled') || [];
      const past = sessions?.filter(s => s.session_date < today || s.status === 'cancelled') || [];

      return new Response(
        JSON.stringify({ upcoming: upcoming.reverse(), past }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create") {
      const { professionalId, sessionTypeId, sessionDate, startTime, endTime, locationId } = params;

      if (!sessionDate || !startTime || !endTime || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Fecha, hora, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CRITICAL: Validate location is public and active
      const { data: location, error: locationError } = await supabase
        .from("center_locations")
        .select("id, name, location_type, is_public, is_active, center_id")
        .eq("id", locationId)
        .eq("center_id", session.centerId)
        .single();

      if (locationError || !location) {
        return new Response(
          JSON.stringify({ error: "Ubicación no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!location.is_public || !location.is_active) {
        return new Response(
          JSON.stringify({ error: "Ubicación no disponible para reservas del portal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_require_approval, portal_default_professional_id, portal_allow_professional_selection, reschedule_slot_duration")
        .eq("id", session.centerId)
        .single();

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center?.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional asignado. Contacta con el centro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session type details
      const { data: sessionType, error: typeError } = await supabase
        .from("session_types")
        .select("id, name, duration_minutes, default_price")
        .eq("id", sessionTypeId)
        .eq("center_id", session.centerId)
        .single();

      if (typeError || !sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ANTI-RACE-CONDITION: Re-validate slot availability
      const dayOfWeek = new Date(sessionDate).getDay();
      const slotStartMinutes = timeToMinutes(startTime);
      const slotEndMinutes = timeToMinutes(endTime);
      const serviceDuration = sessionType.duration_minutes;

      // Check professional availability
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      const profAvailable = profAvailability?.some(slot => {
        const profStart = timeToMinutes(slot.start_time);
        const profEnd = timeToMinutes(slot.end_time);
        return slotStartMinutes >= profStart && slotEndMinutes <= profEnd;
      });

      if (!profAvailable) {
        return new Response(
          JSON.stringify({ error: "Ese horario ya no está disponible. Por favor, elige otro." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check location schedule
      const { data: locationSchedule } = await supabase
        .from("location_schedules")
        .select("start_time, end_time")
        .eq("location_id", locationId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_open", true);

      const locationOpen = locationSchedule?.some(schedule => {
        const locStart = timeToMinutes(schedule.start_time);
        const locEnd = timeToMinutes(schedule.end_time);
        return slotStartMinutes >= locStart && slotEndMinutes <= locEnd;
      });

      if (!locationOpen) {
        return new Response(
          JSON.stringify({ error: "La ubicación no está disponible en ese horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for conflicts with existing sessions
      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("session_date", sessionDate)
        .not("status", "in", '("cancelled","no_show")');

      const hasSessionConflict = existingSessions?.some(s => {
        const sessionStart = timeToMinutes(s.start_time.substring(0, 5));
        const sessionEnd = timeToMinutes(s.end_time.substring(0, 5));
        return slotStartMinutes < sessionEnd && slotEndMinutes > sessionStart;
      });

      if (hasSessionConflict) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse. Por favor, elige otro horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for conflicts with calendar events (Google Calendar)
      const startOfDay = `${sessionDate}T00:00:00`;
      const endOfDay = `${sessionDate}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("start_at, end_at, status, all_day")
        .eq("professional_id", finalProfessionalId)
        .eq("deleted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

      // Use Europe/Madrid timezone for calendar events conversion
      const centerTimezone = 'Europe/Madrid';

      const hasCalendarConflict = calendarEvents?.some(event => {
        if (event.status === 'cancelled') return false;
        if (event.all_day) return true;

        const eventStartMinutes = getLocalTimeMinutes(event.start_at, centerTimezone);
        const eventEndMinutes = getLocalTimeMinutes(event.end_at, centerTimezone);

        return slotStartMinutes < eventEndMinutes && slotEndMinutes > eventStartMinutes;
      });

      if (hasCalendarConflict) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse. Por favor, elige otro horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine session modality based on location type
      const sessionModality = location.location_type === 'online' ? 'online' : 'in_person';

      // Create session
      const status = center?.portal_require_approval ? "pending_approval" : "scheduled";
      
      const { data: newSession, error: createError } = await supabase
        .from("sessions")
        .insert({
          center_id: session.centerId,
          patient_id: session.patientId,
          professional_id: finalProfessionalId,
          session_date: sessionDate,
          start_time: startTime,
          end_time: endTime,
          status,
          session_type: sessionType.name,
          session_modality: sessionModality,
          location_id: locationId,
          price: sessionType.default_price || 0,
          notes: "Cita solicitada desde el portal de pacientes",
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating session:", createError);
        return new Response(
          JSON.stringify({ error: "Error al crear la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send admin alert for portal session created
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email, phone")
        .eq("id", session.patientId)
        .single();

      if (patientData) {
        const alertMessage = buildAlertMessage({
          eventType: status === "pending_approval" ? 'Nueva solicitud de cita (portal paciente)' : 'Nueva cita reservada (portal paciente)',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          patientPhone: patientData.phone,
          sessionDate: sessionDate,
          sessionTime: startTime,
          modality: sessionModality,
          locationName: location.name,
          status: status === "pending_approval" ? 'Pendiente de aprobación' : 'Confirmada',
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId!,
          eventKey: 'portal_created',
          subject: `Nueva cita (portal) — ${patientData.first_name} ${patientData.last_name} — ${sessionDate} ${startTime}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId: newSession.id,
          professionalId: finalProfessionalId,
        });
      }

      // Send patient confirmation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId: newSession.id,
        eventType: 'created',
        sessionDate,
        startTime,
        sessionType: sessionType.name,
        sessionModality,
        locationName: location.name,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          session: newSession,
          message: center?.portal_require_approval 
            ? "Cita solicitada. Recibirás confirmación pronto." 
            : "Cita creada correctamente."
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "cancel") {
      const { sessionId, reason } = params;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "ID de cita requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session belongs to patient
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, patient_id, session_date, start_time, cancellation_policy")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check cancellation policy
      const sessionDateTime = new Date(`${existingSession.session_date}T${existingSession.start_time}`);
      const now = new Date();
      const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      const policyHours: Record<string, number> = {
        "not_allowed": Infinity,
        "until_start": 0,
        "1_hour": 1,
        "2_hours": 2,
        "24_hours": 24,
        "48_hours": 48,
        "72_hours": 72,
      };

      const requiredHours = policyHours[existingSession.cancellation_policy || "24_hours"] || 24;
      
      if (hoursUntilSession < requiredHours) {
        return new Response(
          JSON.stringify({ 
            error: requiredHours === Infinity 
              ? "Esta cita no se puede cancelar" 
              : `La cita debe cancelarse con al menos ${requiredHours} horas de antelación` 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cancel session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ 
          status: "cancelled",
          cancellation_reason: reason || "Cancelada por el paciente desde el portal"
        })
        .eq("id", sessionId);

      if (updateError) {
        console.error("Error cancelling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al cancelar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send admin alert for cancellation
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email")
        .eq("id", session.patientId)
        .single();

      if (patientData && session.centerId) {
        const alertMessage = buildAlertMessage({
          eventType: 'Cita cancelada desde el portal del paciente',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          sessionDate: existingSession.session_date,
          sessionTime: existingSession.start_time,
          details: reason || 'Sin motivo especificado',
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId,
          eventKey: 'portal_cancelled',
          subject: `Cita cancelada (portal) — ${patientData.first_name} ${patientData.last_name} — ${existingSession.session_date}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId: sessionId,
        });
      }

      // Send patient cancellation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId: sessionId,
        eventType: 'cancelled',
        sessionDate: existingSession.session_date,
        startTime: existingSession.start_time,
        reason: reason || undefined,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Cita cancelada correctamente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "confirm") {
      const { sessionId } = params;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "ID de cita requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session belongs to patient
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, patient_id, status")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (existingSession.status !== "pending_confirmation") {
        return new Response(
          JSON.stringify({ error: "Esta cita no requiere confirmación" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Confirm session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ status: "confirmed" })
        .eq("id", sessionId);

      if (updateError) {
        console.error("Error confirming session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al confirmar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Cita confirmada correctamente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reschedule") {
      const { sessionId, newDate, newStartTime, newEndTime } = params;

      if (!sessionId || !newDate || !newStartTime || !newEndTime) {
        return new Response(
          JSON.stringify({ error: "Datos incompletos para reprogramar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session belongs to patient
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, patient_id, session_date, start_time, end_time, status, session_type, session_modality, location_id, professional_id, center_id, cancellation_policy, google_calendar_event_id")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if session can be rescheduled
      if (['cancelled', 'completed', 'no_show'].includes(existingSession.status)) {
        return new Response(
          JSON.stringify({ error: "Esta cita no se puede reprogramar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sessionDateTime = new Date(`${existingSession.session_date}T${existingSession.start_time}`);
      if (sessionDateTime < new Date()) {
        return new Response(
          JSON.stringify({ error: "No se pueden reprogramar citas pasadas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check cancellation policy (same rules apply to reschedule)
      const now = new Date();
      const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const policyHours: Record<string, number> = {
        "not_allowed": Infinity,
        "until_start": 0,
        "1_hour": 1,
        "2_hours": 2,
        "24_hours": 24,
        "48_hours": 48,
        "72_hours": 72,
      };
      const requiredHours = policyHours[existingSession.cancellation_policy || "24_hours"] || 24;
      
      if (hoursUntilSession < requiredHours) {
        return new Response(
          JSON.stringify({ 
            error: requiredHours === Infinity 
              ? "Esta cita no se puede reprogramar" 
              : `La cita debe reprogramarse con al menos ${requiredHours} horas de antelación` 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate new slot availability (anti-race-condition)
      const newSlotStart = timeToMinutes(newStartTime);
      const newSlotEnd = timeToMinutes(newEndTime);
      const newDayOfWeek = new Date(newDate).getDay();

      // Check professional availability
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", existingSession.professional_id)
        .eq("day_of_week", newDayOfWeek)
        .eq("is_available", true);

      const profAvailable = profAvailability?.some(slot => {
        return newSlotStart >= timeToMinutes(slot.start_time) && newSlotEnd <= timeToMinutes(slot.end_time);
      });

      if (!profAvailable) {
        return new Response(
          JSON.stringify({ error: "Ese horario ya no está disponible" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for conflicts with existing sessions (exclude current session)
      const { data: conflictingSessions } = await supabase
        .from("sessions")
        .select("start_time, end_time")
        .eq("professional_id", existingSession.professional_id)
        .eq("session_date", newDate)
        .neq("id", sessionId)
        .not("status", "in", '("cancelled","no_show")');

      const hasConflict = conflictingSessions?.some(s => {
        const sStart = timeToMinutes(s.start_time.substring(0, 5));
        const sEnd = timeToMinutes(s.end_time.substring(0, 5));
        return newSlotStart < sEnd && newSlotEnd > sStart;
      });

      if (hasConflict) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse. Elige otro horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center config for reschedule_require_confirmation
      const { data: centerConfig } = await supabase
        .from("centers")
        .select("reschedule_require_confirmation, name")
        .eq("id", session.centerId)
        .single();

      const newStatus = centerConfig?.reschedule_require_confirmation ? "pending_approval" : "scheduled";

      // Store old values for notification
      const oldDate = existingSession.session_date;
      const oldTime = existingSession.start_time;

      // Update session
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          session_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          status: newStatus,
        })
        .eq("id", sessionId)
        .select("id, session_date, start_time, status")
        .single();

      if (updateError || !updatedSession) {
        console.error("Error rescheduling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al reprogramar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sync to Google Calendar
      if (existingSession.google_calendar_event_id) {
        try {
          const { data: patientForGcal } = await supabase
            .from("patients")
            .select("first_name, last_name")
            .eq("id", session.patientId)
            .single();
          
          const patientName = patientForGcal ? `${patientForGcal.first_name} ${patientForGcal.last_name}` : 'Paciente';
          
          await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              professional_id: existingSession.professional_id,
              event_id: existingSession.google_calendar_event_id,
              psycma_session_id: sessionId,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              title: `${existingSession.session_type || 'Sesión'} - ${patientName}`,
              create_if_not_exists: true,
            }),
          });
        } catch (googleError) {
          console.error("[PORTAL-RESCHEDULE] Google Calendar sync error:", googleError);
        }
      }

      // Get location name for notification
      let locationName: string | undefined;
      if (existingSession.location_id) {
        const { data: loc } = await supabase
          .from("center_locations")
          .select("name")
          .eq("id", existingSession.location_id)
          .single();
        locationName = loc?.name || undefined;
      }

      // Send admin alert
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email, phone")
        .eq("id", session.patientId)
        .single();

      if (patientData && session.centerId) {
        const alertMessage = buildAlertMessage({
          eventType: 'Cita reprogramada desde el portal del paciente',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          oldDate,
          oldTime,
          newDate,
          newTime: newStartTime,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId,
          eventKey: 'portal_rescheduled',
          subject: `Cita reprogramada (portal) — ${patientData.first_name} ${patientData.last_name} — ${newDate} ${newStartTime}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId,
        });
      }

      // Send patient reschedule notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId,
        eventType: 'rescheduled',
        sessionDate: newDate,
        startTime: newStartTime,
        sessionType: existingSession.session_type,
        sessionModality: existingSession.session_modality,
        locationName,
        oldDate,
        oldTime,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          message: centerConfig?.reschedule_require_confirmation 
            ? "Reprogramación enviada para aprobación" 
            : "Cita reprogramada correctamente"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-availability") {
      const { date, professionalId: requestedProfId, sessionTypeId, locationId } = params;

      if (!date || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Fecha, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_default_professional_id, portal_allow_professional_selection, reschedule_slot_duration")
        .eq("id", session.centerId)
        .single();

      // Determine professional
      let professionalId = requestedProfId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        professionalId = center?.portal_default_professional_id;
      }

      if (!professionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session type for duration
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("id", sessionTypeId)
        .single();

      if (!sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;
      const slotDuration = center?.reschedule_slot_duration || 30;
      const dayOfWeek = new Date(date).getDay();

      // Get professional availability
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", professionalId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      // Get location schedule
      const { data: locationSchedule } = await supabase
        .from("location_schedules")
        .select("start_time, end_time")
        .eq("location_id", locationId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_open", true);

      if (!profAvailability?.length || !locationSchedule?.length) {
        return new Response(
          JSON.stringify({ slots: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get existing sessions
      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("start_time, end_time")
        .eq("professional_id", professionalId)
        .eq("session_date", date)
        .not("status", "in", '("cancelled","no_show")');

      // Get calendar events
      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("start_at, end_at, status, all_day")
        .eq("professional_id", professionalId)
        .eq("deleted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

      const centerTimezone = 'Europe/Madrid';

      // Calculate available slots
      const slots: { startTime: string; endTime: string }[] = [];

      for (const profSlot of profAvailability) {
        const profStartMins = timeToMinutes(profSlot.start_time);
        const profEndMins = timeToMinutes(profSlot.end_time);

        for (const locSlot of locationSchedule) {
          const locStartMins = timeToMinutes(locSlot.start_time);
          const locEndMins = timeToMinutes(locSlot.end_time);

          // Intersection of professional and location availability
          const availStart = Math.max(profStartMins, locStartMins);
          const availEnd = Math.min(profEndMins, locEndMins);

          if (availEnd <= availStart) continue;

          // Generate slots
          for (let slotStart = availStart; slotStart + serviceDuration <= availEnd; slotStart += slotDuration) {
            const slotEnd = slotStart + serviceDuration;

            // Check session conflicts
            const hasSessionConflict = existingSessions?.some(s => {
              const sessionStart = timeToMinutes(s.start_time.substring(0, 5));
              const sessionEnd = timeToMinutes(s.end_time.substring(0, 5));
              return slotStart < sessionEnd && slotEnd > sessionStart;
            });

            if (hasSessionConflict) continue;

            // Check calendar conflicts
            const hasCalendarConflict = calendarEvents?.some(event => {
              if (event.status === 'cancelled') return false;
              if (event.all_day) return true;

              const eventStartMinutes = getLocalTimeMinutes(event.start_at, centerTimezone);
              const eventEndMinutes = getLocalTimeMinutes(event.end_at, centerTimezone);

              return slotStart < eventEndMinutes && slotEnd > eventStartMinutes;
            });

            if (hasCalendarConflict) continue;

            // Check if slot is in the past
            const now = new Date();
            const slotDateTime = new Date(`${date}T${minutesToTime(slotStart)}:00`);
            if (slotDateTime <= now) continue;

            slots.push({
              startTime: minutesToTime(slotStart),
              endTime: minutesToTime(slotEnd),
            });
          }
        }
      }

      // Remove duplicates and sort
      const uniqueSlots = slots.filter((slot, index, self) =>
        index === self.findIndex(s => s.startTime === slot.startTime && s.endTime === slot.endTime)
      ).sort((a, b) => a.startTime.localeCompare(b.startTime));

      return new Response(
        JSON.stringify({ 
          slots: uniqueSlots.map(s => s.startTime),
          serviceDuration,
          step: slotDuration
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in patient-portal-sessions:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

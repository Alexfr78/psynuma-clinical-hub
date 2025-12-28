import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage } from "../_shared/adminAlerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function validateSession(sessionToken: string): { valid: boolean; patientId?: string; centerId?: string } {
  try {
    const decoded = JSON.parse(atob(sessionToken));
    if (decoded.exp < Date.now()) {
      return { valid: false };
    }
    return { valid: true, patientId: decoded.patient_id, centerId: decoded.center_id };
  } catch {
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

    // Validate session token
    const session = validateSession(sessionToken);
    if (!session.valid || !session.patientId) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      // Get patient's sessions
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
        .neq("status", "cancelled")
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
      const today = new Date().toISOString().split("T")[0];
      const upcoming = sessions?.filter(s => s.session_date >= today) || [];
      const past = sessions?.filter(s => s.session_date < today) || [];

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

      // Update to confirmed
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
        JSON.stringify({ success: true, message: "Cita confirmada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-availability") {
      const { professionalId, date, sessionTypeId, locationId } = params;

      if (!date || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Fecha, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CRITICAL: Validate location is public and active
      const { data: location, error: locationError } = await supabase
        .from("center_locations")
        .select("id, location_type, is_public, is_active, center_id")
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
          JSON.stringify({ error: "Ubicación no disponible para el portal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session type for duration
      const { data: sessionType, error: typeError } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("id", sessionTypeId)
        .eq("center_id", session.centerId)
        .single();

      if (typeError || !sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;

      // Get center config for step
      const { data: center } = await supabase
        .from("centers")
        .select("reschedule_slot_duration, portal_default_professional_id, portal_allow_professional_selection")
        .eq("id", session.centerId)
        .single();

      const step = center?.reschedule_slot_duration || 30;

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center?.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ slots: [], serviceDuration, step }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const dayOfWeek = new Date(date).getDay();

      // 1. Get professional's availability for the day
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      if (!profAvailability?.length) {
        return new Response(
          JSON.stringify({ slots: [], serviceDuration, step }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Get location schedule for this day
      const { data: locationSchedules } = await supabase
        .from("location_schedules")
        .select("start_time, end_time")
        .eq("location_id", locationId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_open", true);

      if (!locationSchedules?.length) {
        return new Response(
          JSON.stringify({ slots: [], serviceDuration, step }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Get existing sessions for that day
      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("session_date", date)
        .not("status", "in", '("cancelled","no_show")');

      // 4. Get calendar events for that day (Google Calendar blocking)
      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("start_at, end_at, status, all_day")
        .eq("professional_id", finalProfessionalId)
        .eq("deleted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

      // 5. Calculate intersection and generate slots
      const slots: string[] = [];
      
      // Use Europe/Madrid timezone for calendar events conversion
      const centerTimezone = 'Europe/Madrid';
      
      // For 60-min services, prefer full-hour slots to maximize capacity
      const preferFullHours = serviceDuration % 60 === 0;
      const effectiveStep = preferFullHours ? 60 : step;

      for (const profSlot of profAvailability) {
        const profStart = timeToMinutes(profSlot.start_time);
        const profEnd = timeToMinutes(profSlot.end_time);

        for (const locSchedule of locationSchedules) {
          const locStart = timeToMinutes(locSchedule.start_time);
          const locEnd = timeToMinutes(locSchedule.end_time);

          // Calculate intersection
          const intersectionStart = Math.max(profStart, locStart);
          const intersectionEnd = Math.min(profEnd, locEnd);

          if (intersectionStart >= intersectionEnd) continue;

          // Helper to check if a slot is valid (no conflicts)
          const isSlotValid = (time: number): boolean => {
            const slotEndMinutes = time + serviceDuration;
            
            // Check if slot fits in the intersection
            if (slotEndMinutes > intersectionEnd) return false;
            
            // Check conflicts with existing sessions
            const hasSessionConflict = existingSessions?.some(s => {
              const sessionStart = timeToMinutes(s.start_time.substring(0, 5));
              const sessionEnd = timeToMinutes(s.end_time.substring(0, 5));
              return time < sessionEnd && slotEndMinutes > sessionStart;
            });
            if (hasSessionConflict) return false;

            // Check conflicts with calendar events (using correct timezone)
            const hasCalendarConflict = calendarEvents?.some(event => {
              if (event.status === 'cancelled') return false;
              if (event.all_day) return true;

              const eventStartMinutes = getLocalTimeMinutes(event.start_at, centerTimezone);
              const eventEndMinutes = getLocalTimeMinutes(event.end_at, centerTimezone);

              return time < eventEndMinutes && slotEndMinutes > eventStartMinutes;
            });
            if (hasCalendarConflict) return false;
            
            return true;
          };

          // Generate primary slots (full hours for 60-min services)
          for (let time = intersectionStart; time + serviceDuration <= intersectionEnd; time += effectiveStep) {
            if (isSlotValid(time)) {
              const slotTime = minutesToTime(time);
              if (!slots.includes(slotTime)) {
                slots.push(slotTime);
              }
            }
          }
          
          // For 60-min services, add :30 slots only where sessions create gaps
          if (preferFullHours && existingSessions?.length) {
            existingSessions.forEach(session => {
              const sessionEnd = timeToMinutes(session.end_time.substring(0, 5));
              // If session ends at :30 and creates a gap we can fill
              if (sessionEnd % 60 !== 0 && sessionEnd >= intersectionStart && sessionEnd + serviceDuration <= intersectionEnd) {
                if (isSlotValid(sessionEnd)) {
                  const slotTime = minutesToTime(sessionEnd);
                  if (!slots.includes(slotTime)) {
                    slots.push(slotTime);
                  }
                }
              }
            });
          }
        }
      }

      // Sort slots chronologically
      slots.sort();

      console.log("Generated slots:", slots.length, "for date:", date, "serviceDuration:", serviceDuration);

      return new Response(
        JSON.stringify({ slots, serviceDuration, step }),
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

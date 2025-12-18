import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
            id, name, street, city
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
      const { professionalId, sessionTypeId, sessionDate, startTime, endTime } = params;

      if (!sessionDate || !startTime || !endTime) {
        return new Response(
          JSON.stringify({ error: "Fecha y hora son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_require_approval, portal_default_professional_id, portal_allow_professional_selection")
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

      // Get session type details for duration
      let sessionTypeName = "Consulta";
      if (sessionTypeId) {
        const { data: sessionType } = await supabase
          .from("session_types")
          .select("name")
          .eq("id", sessionTypeId)
          .single();
        if (sessionType) {
          sessionTypeName = sessionType.name;
        }
      }

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
          session_type: sessionTypeName,
          session_modality: "in_person",
          price: 0, // Price not shown to patients
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
      const { professionalId, date } = params;

      if (!professionalId || !date) {
        return new Response(
          JSON.stringify({ error: "Profesional y fecha son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const dayOfWeek = new Date(date).getDay();

      // 1. Get professional's availability for the day
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time, is_available")
        .eq("professional_id", professionalId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      // 2. Get PUBLIC location schedules for this center and day
      const { data: publicLocations } = await supabase
        .from("center_locations")
        .select("id, name, is_public")
        .eq("center_id", session.centerId)
        .eq("is_active", true)
        .eq("is_public", true);

      if (!publicLocations || publicLocations.length === 0) {
        console.log("No public locations found for center:", session.centerId);
        return new Response(
          JSON.stringify({ slots: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get schedules for all public locations
      const locationIds = publicLocations.map(loc => loc.id);
      const { data: locationSchedules } = await supabase
        .from("location_schedules")
        .select("location_id, day_of_week, start_time, end_time, is_open")
        .in("location_id", locationIds)
        .eq("day_of_week", dayOfWeek)
        .eq("is_open", true);

      // 3. If no professional availability or no public locations open, return empty
      if (!profAvailability?.length || !locationSchedules?.length) {
        console.log("No availability - profAvailability:", profAvailability?.length, "locationSchedules:", locationSchedules?.length);
        return new Response(
          JSON.stringify({ slots: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4. Get existing sessions for that day
      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("start_time, end_time")
        .eq("professional_id", professionalId)
        .eq("session_date", date)
        .not("status", "in", '("cancelled","no_show")');

      // 5. Get center's slot duration
      const { data: center } = await supabase
        .from("centers")
        .select("reschedule_slot_duration")
        .eq("id", session.centerId)
        .single();

      const slotDuration = center?.reschedule_slot_duration || 30;

      // 6. Calculate intersection of professional availability and location schedules
      // Combine all location schedules into time ranges
      const locationRanges = locationSchedules.map(schedule => ({
        start: timeToMinutes(schedule.start_time),
        end: timeToMinutes(schedule.end_time)
      }));

      // 7. Generate slots from INTERSECTION of prof availability and location schedules
      const slots: string[] = [];

      for (const profSlot of profAvailability) {
        const profStart = timeToMinutes(profSlot.start_time);
        const profEnd = timeToMinutes(profSlot.end_time);

        for (const locRange of locationRanges) {
          // Calculate intersection
          const intersectionStart = Math.max(profStart, locRange.start);
          const intersectionEnd = Math.min(profEnd, locRange.end);

          if (intersectionStart >= intersectionEnd) continue; // No overlap

          // Generate slots within intersection
          for (let time = intersectionStart; time + slotDuration <= intersectionEnd; time += slotDuration) {
            const slotTime = minutesToTime(time);
            const slotEndTime = minutesToTime(time + slotDuration);

            // Check conflicts with existing sessions
            const hasConflict = existingSessions?.some(s => {
              const sessionStart = s.start_time.substring(0, 5);
              const sessionEnd = s.end_time.substring(0, 5);
              return slotTime < sessionEnd && slotEndTime > sessionStart;
            });

            if (!hasConflict && !slots.includes(slotTime)) {
              slots.push(slotTime);
            }
          }
        }
      }

      // Sort slots chronologically
      slots.sort();

      console.log("Generated slots:", slots.length, "for date:", date, "professional:", professionalId);

      return new Response(
        JSON.stringify({ slots, slotDuration }),
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

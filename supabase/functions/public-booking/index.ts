import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage } from "../_shared/adminAlerts.ts";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalBooking } from "../_shared/professionalNotification.ts";
import { evaluateCancellationCharge, resolveCancellationBasePrice, resolvePaymentRules } from "../_shared/paymentRules.ts";
import { autoApplyAvailableBonoToSession } from "../_shared/bonoAutomation.ts";
import { resolvePatientCancellationPolicyForSession, resolveSignedCancellationPolicyVersionForSession } from "../_shared/cancellationPolicy.ts";
import { isValidEmail, isValidDate, isValidTime, isValidName } from "../_shared/validation.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import { resolveDayAvailability } from "../_shared/availability-core.ts";
import {
  buildDayScheduleInput,
  minutesToTime as coreMinutesToTime,
  APP_TZ,
} from "../_shared/special-days-adapter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use SUPABASE_SERVICE_ROLE_KEY as HMAC secret for signing tokens
// This is secure because the service key is never exposed to clients
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ===== Helper functions (reused from patient-portal-sessions) =====

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

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

function getLocalDate(isoDatetime: string, timezone: string): string {
  const date = new Date(isoDatetime);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone
  });
  return formatter.format(date);
}

// Format a date (year, month 1-indexed, day) as YYYY-MM-DD in local TZ
function formatDateLocal(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Check if datetime ends exactly at midnight (00:00:00)
function endsAtMidnight(isoDatetime: string, timezone: string): boolean {
  const date = new Date(isoDatetime);
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    timeZone: timezone
  });
  const parts = formatter.formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const s = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  return h === 0 && m === 0 && s === 0;
}

// Expand multi-day/all-day event to all dates it covers within month bounds
function expandEventToDates(
  event: { start_at: string | null; end_at: string | null; all_day: boolean | null },
  monthStart: string,
  monthEnd: string,
  timezone: string
): string[] {
  const dates: string[] = [];
  
  if (!event.start_at) return dates;
  
  const eventStartDate = getLocalDate(event.start_at, timezone);
  
  // For all_day or null end_at, just include start date
  if (event.all_day || !event.end_at) {
    if (eventStartDate >= monthStart && eventStartDate < monthEnd) {
      dates.push(eventStartDate);
    }
    return dates;
  }
  
  let eventEndDate = getLocalDate(event.end_at, timezone);
  
  // If ends exactly at midnight, the last day is the previous day
  if (endsAtMidnight(event.end_at, timezone)) {
    const endDateObj = new Date(event.end_at);
    endDateObj.setDate(endDateObj.getDate() - 1);
    eventEndDate = getLocalDate(endDateObj.toISOString(), timezone);
  }
  
  // Clamp to month bounds
  const clampedStart = eventStartDate < monthStart ? monthStart : eventStartDate;
  const clampedEnd = eventEndDate >= monthEnd ? 
    formatDateLocal(
      parseInt(monthEnd.split('-')[0]),
      parseInt(monthEnd.split('-')[1]),
      0 // Day 0 = last day of previous month, but we use monthEnd as exclusive
    ) : eventEndDate;
  
  // Generate all dates from clampedStart to clampedEnd (inclusive)
  let currentDate = new Date(clampedStart + 'T12:00:00Z'); // Noon to avoid DST issues
  const endDate = new Date((eventEndDate >= monthEnd ? monthEnd : eventEndDate) + 'T12:00:00Z');
  
  while (currentDate <= endDate) {
    const dateStr = formatDateLocal(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth() + 1,
      currentDate.getUTCDate()
    );
    if (dateStr >= monthStart && dateStr < monthEnd) {
      dates.push(dateStr);
    }
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  
  return dates;
}

// ===== HMAC-SHA256 Signed Booking Tokens =====
// Prevents token forgery by cryptographically signing the payload

async function signBookingToken(payload: object): Promise<string> {
  const encoder = new TextEncoder();
  const data = JSON.stringify(payload);
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  // Token format: base64(payload).base64(signature)
  return `${btoa(data)}.${signatureB64}`;
}

async function verifyBookingToken(token: string): Promise<{ valid: boolean; sessionId?: string; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) {
      console.log("[verifyBookingToken] Invalid token format - missing parts");
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
      console.log("[verifyBookingToken] Invalid signature");
      return { valid: false };
    }
    
    const decoded = JSON.parse(data);
    
    // Check expiration
    if (decoded.exp < Date.now()) {
      console.log("[verifyBookingToken] Token expired");
      return { valid: false };
    }
    
    return { 
      valid: true, 
      sessionId: decoded.session_id,
      patientId: decoded.patient_id, 
      centerId: decoded.center_id 
    };
  } catch (error) {
    console.error("[verifyBookingToken] Error:", error);
    return { valid: false };
  }
}

// Wrapper to generate signed booking token
async function generateBookingToken(sessionId: string, patientId: string, centerId: string): Promise<string> {
  const payload = {
    session_id: sessionId,
    patient_id: patientId,
    center_id: centerId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  return signBookingToken(payload);
}

// Cancellation policy hours mapping
const policyHoursMap: Record<string, number> = {
  "not_allowed": Infinity,
  "until_start": 0,
  "1_hour": 1,
  "2_hours": 2,
  "24_hours": 24,
  "48_hours": 48,
  "72_hours": 72,
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, centerSlug, ...params } = await req.json();

    console.log(`[public-booking] action=${action} centerSlug=${centerSlug}`);

    // Per-action rate limiting: strict for write/sensitive, generous for read.
    // Keys are scoped per action so reads don't starve writes and vice-versa.
    {
      const ip = getClientIp(req);
      const writeActions = new Set([
        'create-booking',
        'submit-intake-request',
        'cancel-booking',
        'reschedule-booking',
        'get-referral-recommendations',
      ]);
      const isWrite = writeActions.has(action);
      const rlAction = `public-booking:${isWrite ? 'write' : 'read'}`;
      // reads: 120 / 10min, writes: 10 / 10min
      const maxReq = isWrite ? 10 : 120;
      const rl = await checkIpRateLimit(supabase, ip, rlAction, maxReq, 10);
      if (!rl.allowed) {
        console.warn(`[public-booking] rate-limit hit ip=${ip} action=${action} bucket=${rlAction}`);
        return new Response(
          JSON.stringify({
            error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.',
            rateLimited: true,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(rl.retryAfterSeconds),
            },
          }
        );
      }
    }

    // ===== BOOTSTRAP (single call returning config + services + locations + professionals) =====
    if (action === "bootstrap") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: center, error: centerErr } = await supabase
        .from("centers")
        .select(`
          id, name, logo_url,
          public_booking_enabled, portal_require_approval,
          portal_allow_professional_selection, portal_default_professional_id,
          reschedule_slot_duration, reschedule_max_days, portal_agenda_closed
        `)
        .eq("portal_slug", centerSlug)
        .single();

      if (centerErr || !center) {
        console.warn(`[public-booking:bootstrap] center not found slug=${centerSlug}`);
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!center.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas públicas no habilitadas para este centro", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const config = {
        centerId: center.id,
        name: center.name,
        logoUrl: center.logo_url,
        timezone: "Europe/Madrid",
        requireApproval: center.portal_require_approval,
        allowProfessionalSelection: center.portal_allow_professional_selection,
        defaultProfessionalId: center.portal_default_professional_id,
        slotDuration: center.reschedule_slot_duration || 30,
        maxDaysAhead: center.reschedule_max_days ?? 90,
        agendaClosed: center.portal_agenda_closed ?? false,
      };

      // If agenda is closed we don't need to load the rest — frontend will show ClosedAgendaScreen
      if (config.agendaClosed) {
        return new Response(
          JSON.stringify({
            config,
            services: [],
            locations: [],
            professionals: [],
            allowProfessionalSelection: !!center.portal_allow_professional_selection,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const [servicesRes, locationsRes, professionalsRes] = await Promise.all([
        supabase
          .from("session_types")
          .select("id, name, duration_minutes, default_price, color, is_first_consultation")
          .eq("center_id", center.id)
          .eq("is_active", true)
          .eq("is_public", true)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("center_locations")
          .select("id, name, location_type, street, city")
          .eq("center_id", center.id)
          .eq("is_public", true)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, specialty, avatar_url")
          .eq("center_id", center.id)
          .eq("is_active", true)
          .order("first_name"),
      ]);

      if (servicesRes.error) console.error("[bootstrap] services error:", servicesRes.error);
      if (locationsRes.error) console.error("[bootstrap] locations error:", locationsRes.error);
      if (professionalsRes.error) console.error("[bootstrap] professionals error:", professionalsRes.error);

      console.log(
        `[public-booking:bootstrap] slug=${centerSlug} services=${servicesRes.data?.length ?? 0} ` +
        `locations=${locationsRes.data?.length ?? 0} professionals=${professionalsRes.data?.length ?? 0}`
      );

      return new Response(
        JSON.stringify({
          config,
          services: servicesRes.data || [],
          locations: locationsRes.data || [],
          professionals: professionalsRes.data || [],
          allowProfessionalSelection: !!center.portal_allow_professional_selection,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET-CONFIG =====
    if (action === "get-config") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: center, error } = await supabase
        .from("centers")
        .select(`
          id, name, logo_url,
          public_booking_enabled, portal_require_approval,
          portal_allow_professional_selection, portal_default_professional_id,
          reschedule_slot_duration, reschedule_max_days, portal_agenda_closed
        `)
        .eq("portal_slug", centerSlug)
        .single();

      if (error || !center) {
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!center.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas públicas no habilitadas para este centro", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Debug logging for portal_agenda_closed
      console.log(`[public-booking:get-config] centerSlug=${centerSlug} portal_agenda_closed=${center.portal_agenda_closed} (type: ${typeof center.portal_agenda_closed})`);

      return new Response(
        JSON.stringify({
          centerId: center.id,
          name: center.name,
          logoUrl: center.logo_url,
          timezone: "Europe/Madrid",
          requireApproval: center.portal_require_approval,
          allowProfessionalSelection: center.portal_allow_professional_selection,
          defaultProfessionalId: center.portal_default_professional_id,
          slotDuration: center.reschedule_slot_duration || 30,
          maxDaysAhead: center.reschedule_max_days ?? 90,
          agendaClosed: center.portal_agenda_closed ?? false
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LIST-SERVICES =====
    if (action === "list-services") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center ID from slug
      const { data: center } = await supabase
        .from("centers")
        .select("id, public_booking_enabled")
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: services, error } = await supabase
        .from("session_types")
        .select("id, name, duration_minutes, default_price, color, is_first_consultation")
        .eq("center_id", center.id)
        .eq("is_active", true)
        .eq("is_public", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching services:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener servicios" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ services: services || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LIST-LOCATIONS =====
    if (action === "list-locations") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: center } = await supabase
        .from("centers")
        .select("id, public_booking_enabled")
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: locations, error } = await supabase
        .from("center_locations")
        .select("id, name, location_type, street, city")
        .eq("center_id", center.id)
        .eq("is_public", true)
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Error fetching locations:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener ubicaciones" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ locations: locations || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LIST-PROFESSIONALS =====
    if (action === "list-professionals") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: center } = await supabase
        .from("centers")
        .select("id, public_booking_enabled, portal_allow_professional_selection")
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get active professionals for this center
      const { data: professionals, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, specialty, avatar_url")
        .eq("center_id", center.id)
        .eq("is_active", true)
        .order("first_name");

      if (error) {
        console.error("Error fetching professionals:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener profesionales" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          professionals: professionals || [],
          allowSelection: center.portal_allow_professional_selection 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET-AVAILABILITY =====
    if (action === "get-availability") {
      const { date, sessionTypeId, locationId, professionalId } = params;

      if (!centerSlug || !date || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Faltan parámetros requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValidDate(date)) {
        return new Response(
          JSON.stringify({ error: "Formato de fecha inválido (esperado YYYY-MM-DD)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center config
      const { data: center } = await supabase
        .from("centers")
        .select(`
          id, public_booking_enabled, 
          portal_default_professional_id, portal_allow_professional_selection,
          reschedule_slot_duration, reschedule_max_days
        `)
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate location is public and active
      const { data: location } = await supabase
        .from("center_locations")
        .select("id, location_type, is_public, is_active")
        .eq("id", locationId)
        .eq("center_id", center.id)
        .single();

      if (!location || !location.is_public || !location.is_active) {
        return new Response(
          JSON.stringify({ error: "Ubicación no válida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate session type is public
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("id, duration_minutes, is_public, is_active")
        .eq("id", sessionTypeId)
        .eq("center_id", center.id)
        .single();

      if (!sessionType || !sessionType.is_public || !sessionType.is_active) {
        return new Response(
          JSON.stringify({ error: "Servicio no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ slots: [], serviceDuration: sessionType.duration_minutes }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate date is within allowed range
      const maxDaysAhead = center.reschedule_max_days ?? 90;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const requestedDate = new Date(date);
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + maxDaysAhead);

      if (requestedDate < today || requestedDate > maxDate) {
        return new Response(
          JSON.stringify({ slots: [], serviceDuration: sessionType.duration_minutes }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;
      const step = center.reschedule_slot_duration || 30;
      const dayOfWeek = new Date(date).getDay();
      const centerTimezone = 'Europe/Madrid';

      // Get minPublicDuration for scoring
      const { data: allPublicTypes } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("center_id", center.id)
        .eq("is_active", true)
        .eq("is_public", true);

      const minPublicDuration = allPublicTypes?.length
        ? Math.min(...allPublicTypes.map((t: any) => t.duration_minutes))
        : serviceDuration;

      // Weekly availability (puede estar vacío: un special_day custom/extended
      // puede generar slots aunque no haya horario semanal para ese day_of_week).
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      // Location schedule (límite duro: si no hay registro abierto, sin slots).
      const { data: locationSchedules } = await supabase
        .from("location_schedules")
        .select("start_time, end_time, is_open")
        .eq("location_id", locationId)
        .eq("day_of_week", dayOfWeek);

      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("id, start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("session_date", date)
        .not("status", "in", '("cancelled","no_show")');

      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("id, start_at, end_at, status, all_day, is_converted, deleted")
        .eq("professional_id", finalProfessionalId)
        .eq("deleted", false)
        .eq("is_converted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

      const { data: scheduleExceptions } = await supabase
        .from("schedule_exceptions")
        .select("id, scope, start_date, end_date, all_day, start_time, end_time, reason_type, reason_label, affects_booking, professional_id")
        .eq("center_id", center.id)
        .eq("affects_booking", true)
        .lte("start_date", date)
        .gte("end_date", date);

      // Special days (overrides del horario base con prioridad prof > centro).
      const { data: specialDays } = await supabase
        .from("special_days")
        .select("id, scope, professional_id, type, start_date, end_date, affects_public_booking, created_at, special_day_slots(start_time, end_time)")
        .eq("center_id", center.id)
        .eq("affects_public_booking", true)
        .lte("start_date", date)
        .gte("end_date", date);

      // Mantener el blockReason de schedule_exceptions all_day para la UI actual.
      if (scheduleExceptions?.length) {
        for (const exc of scheduleExceptions) {
          if (exc.scope === 'professional' && exc.professional_id !== finalProfessionalId) continue;
          if (exc.all_day) {
            console.log(`[get-availability] date=${date} blocked by ${exc.scope} exception: ${exc.reason_type}`);
            return new Response(
              JSON.stringify({ slots: [], serviceDuration, blocked: true, blockReason: exc.reason_label || exc.reason_type }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const dayInput = buildDayScheduleInput({
        date,
        professionalId: finalProfessionalId,
        isPublicContext: true,
        weeklyAvailability: profAvailability ?? [],
        locationSchedules: locationSchedules ?? [],
        specialDays: (specialDays as any) ?? [],
        scheduleExceptions: (scheduleExceptions as any) ?? [],
        sessions: (existingSessions as any) ?? [],
        calendarEvents: (calendarEvents as any) ?? [],
        timezone: centerTimezone,
      });

      const resolved = resolveDayAvailability(dayInput, {
        durationMin: serviceDuration,
        stepMin: step,
        minPublicDurationMin: minPublicDuration,
      });

      const slots = resolved.map((s) => ({
        startTime: coreMinutesToTime(s.startMin),
        endTime: coreMinutesToTime(s.endMin),
        isOptimal: s.isOptimal,
      }));

      console.log(`[get-availability] date=${date} slots=${slots.length} (optimal=${slots.filter(s => s.isOptimal).length})`);

      return new Response(
        JSON.stringify({ slots, serviceDuration }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET-AVAILABILITY-MONTH =====
    if (action === "get-availability-month") {
      const { month, sessionTypeId, locationId, professionalId } = params;

      if (!centerSlug || !month || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Faltan parámetros requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center config
      const { data: center } = await supabase
        .from("centers")
        .select(`
          id, public_booking_enabled,
          portal_default_professional_id, portal_allow_professional_selection,
          reschedule_slot_duration, reschedule_max_days
        `)
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate location is public and active
      const { data: location } = await supabase
        .from("center_locations")
        .select("id, is_public, is_active")
        .eq("id", locationId)
        .eq("center_id", center.id)
        .single();

      if (!location || !location.is_public || !location.is_active) {
        return new Response(
          JSON.stringify({ error: "Ubicación no válida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate session type
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("id, duration_minutes, is_public, is_active")
        .eq("id", sessionTypeId)
        .eq("center_id", center.id)
        .single();

      if (!sessionType || !sessionType.is_public || !sessionType.is_active) {
        return new Response(
          JSON.stringify({ error: "Servicio no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ month, days: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;
      const step = center.reschedule_slot_duration || 30;
      const centerTimezone = 'Europe/Madrid';
      const maxDaysAhead = center.reschedule_max_days ?? 90;

      // Get minPublicDuration for scoring
      const { data: allPublicTypes } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("center_id", center.id)
        .eq("is_active", true)
        .eq("is_public", true);

      const minPublicDuration = allPublicTypes?.length
        ? Math.min(...allPublicTypes.map((t: any) => t.duration_minutes))
        : serviceDuration;

      // Calculate today and max allowed date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxAllowedDate = new Date(today);
      maxAllowedDate.setDate(maxAllowedDate.getDate() + maxDaysAhead);
      const todayStr = formatDateLocal(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const maxDateStr = formatDateLocal(maxAllowedDate.getFullYear(), maxAllowedDate.getMonth() + 1, maxAllowedDate.getDate());

      // Parse month and calculate range
      const [yearStr, monthStr] = month.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr); // 1-indexed
      
      const startStr = formatDateLocal(year, monthNum, 1);
      const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
      const nextYear = monthNum === 12 ? year + 1 : year;
      const endStr = formatDateLocal(nextYear, nextMonth, 1);
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      console.log(`[get-availability-month] month=${month} range=${startStr} to ${endStr} days=${daysInMonth}`);

      // Fetch all sessions for the month in ONE query
      const { data: monthSessions } = await supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time, status")
        .eq("professional_id", finalProfessionalId)
        .gte("session_date", startStr)
        .lt("session_date", endStr)
        .not("status", "in", '("cancelled","no_show")');

      // Fetch all calendar events that INTERSECT the month
      const { data: monthEvents } = await supabase
        .from("calendar_events")
        .select("id, start_at, end_at, all_day, status, deleted")
        .eq("professional_id", finalProfessionalId)
        .eq("deleted", false)
        .or(`end_at.is.null,end_at.gte.${startStr}T00:00:00`)
        .lt("start_at", `${endStr}T00:00:00`);

      // Pre-index sessions by date.
      const sessionsByDate: Record<string, any[]> = {};
      for (const s of monthSessions || []) {
        if (!sessionsByDate[s.session_date]) sessionsByDate[s.session_date] = [];
        sessionsByDate[s.session_date]!.push(s);
      }

      // Pre-index events by date (expand multi-day events).
      const eventsByDate: Record<string, any[]> = {};
      for (const e of monthEvents || []) {
        if (e.status === 'cancelled') continue;
        const affectedDates = expandEventToDates(e, startStr, endStr, centerTimezone);
        for (const dateStr of affectedDates) {
          if (!eventsByDate[dateStr]) eventsByDate[dateStr] = [];
          eventsByDate[dateStr]!.push(e);
        }
      }

      // Cache de availability/location_schedules por day_of_week.
      const availabilityByDow: Record<number, { start_time: string; end_time: string }[]> = {};
      const locationSchedulesByDow: Record<number, { start_time: string; end_time: string; is_open: boolean | null }[]> = {};

      const { data: allAvailability } = await supabase
        .from("availability")
        .select("day_of_week, start_time, end_time")
        .eq("professional_id", finalProfessionalId)
        .eq("is_available", true);

      for (const a of allAvailability || []) {
        if (!availabilityByDow[a.day_of_week]) availabilityByDow[a.day_of_week] = [];
        availabilityByDow[a.day_of_week].push({ start_time: a.start_time, end_time: a.end_time });
      }

      const { data: allLocationSchedules } = await supabase
        .from("location_schedules")
        .select("day_of_week, start_time, end_time, is_open")
        .eq("location_id", locationId);

      for (const l of allLocationSchedules || []) {
        if (!locationSchedulesByDow[l.day_of_week]) locationSchedulesByDow[l.day_of_week] = [];
        locationSchedulesByDow[l.day_of_week].push({
          start_time: l.start_time,
          end_time: l.end_time,
          is_open: l.is_open,
        });
      }

      // Schedule exceptions del mes (afectan a booking).
      const { data: monthExceptions } = await supabase
        .from("schedule_exceptions")
        .select("id, scope, start_date, end_date, all_day, start_time, end_time, professional_id, affects_booking")
        .eq("center_id", center.id)
        .eq("affects_booking", true)
        .lte("start_date", endStr)
        .gte("end_date", startStr);

      // Special days del mes con sus slots anidados.
      const { data: monthSpecialDays } = await supabase
        .from("special_days")
        .select("id, scope, professional_id, type, start_date, end_date, affects_public_booking, created_at, special_day_slots(start_time, end_time)")
        .eq("center_id", center.id)
        .eq("affects_public_booking", true)
        .lte("start_date", endStr)
        .gte("end_date", startStr);

      // Mismo resolver que get-availability, día a día.
      const days: { date: string; availableCount: number }[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = formatDateLocal(year, monthNum, d);

        if (dateStr < todayStr || dateStr > maxDateStr) {
          days.push({ date: dateStr, availableCount: 0 });
          continue;
        }

        const dateObj = new Date(year, monthNum - 1, d);
        const dayOfWeek = dateObj.getDay();

        const dayInput = buildDayScheduleInput({
          date: dateStr,
          professionalId: finalProfessionalId,
          isPublicContext: true,
          weeklyAvailability: availabilityByDow[dayOfWeek] || [],
          locationSchedules: locationSchedulesByDow[dayOfWeek] || [],
          specialDays: (monthSpecialDays as any) ?? [],
          scheduleExceptions: (monthExceptions as any) ?? [],
          sessions: sessionsByDate[dateStr] || [],
          calendarEvents: eventsByDate[dateStr] || [],
          timezone: centerTimezone,
        });

        const resolved = resolveDayAvailability(dayInput, {
          durationMin: serviceDuration,
          stepMin: step,
          minPublicDurationMin: minPublicDuration,
        });

        const availableCount = resolved.filter((s) => s.isOptimal).length;
        days.push({ date: dateStr, availableCount });
      }

      console.log(`[get-availability-month] month=${month} calculated ${days.length} days`);

      return new Response(
        JSON.stringify({ month, days }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== CREATE-BOOKING =====
    if (action === "create-booking") {
      const { 
        sessionTypeId, locationId, professionalId, 
        sessionDate, startTime, endTime,
        patient, acceptPrivacy, notes 
      } = params;

      // Validate required fields
      if (!centerSlug || !sessionTypeId || !locationId || !sessionDate || !startTime || !endTime) {
        return new Response(
          JSON.stringify({ error: "Faltan parámetros requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!patient?.firstName || !patient?.lastName || !patient?.email) {
        return new Response(
          JSON.stringify({ error: "Datos del paciente incompletos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate input formats
      if (!isValidDate(sessionDate)) {
        return new Response(
          JSON.stringify({ error: "Formato de fecha inválido (esperado YYYY-MM-DD)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        return new Response(
          JSON.stringify({ error: "Formato de hora inválido (esperado HH:MM)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!isValidEmail(patient.email)) {
        return new Response(
          JSON.stringify({ error: "Formato de email inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!isValidName(patient.firstName) || !isValidName(patient.lastName)) {
        return new Response(
          JSON.stringify({ error: "Nombre o apellido inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!acceptPrivacy) {
        return new Response(
          JSON.stringify({ error: "Debe aceptar la política de privacidad" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center
      const { data: center } = await supabase
        .from("centers")
        .select(`
          id, public_booking_enabled, 
          portal_require_approval, portal_default_professional_id, portal_allow_professional_selection,
          reschedule_max_days, default_payment_mode, default_scheduled_hours_before, default_advance_payment_limit_hours
        `)
        .eq("portal_slug", centerSlug)
        .single();

      if (!center?.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate location
      const { data: location } = await supabase
        .from("center_locations")
        .select("id, location_type, is_public, is_active")
        .eq("id", locationId)
        .eq("center_id", center.id)
        .single();

      if (!location || !location.is_public || !location.is_active) {
        return new Response(
          JSON.stringify({ error: "Ubicación no válida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate session type
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("id, name, duration_minutes, default_price, is_public, is_active")
        .eq("id", sessionTypeId)
        .eq("center_id", center.id)
        .single();

      if (!sessionType || !sessionType.is_public || !sessionType.is_active) {
        return new Response(
          JSON.stringify({ error: "Servicio no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional disponible" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate booking date is within allowed range
      const maxDaysAhead = center.reschedule_max_days ?? 90;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bookingDate = new Date(sessionDate);
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + maxDaysAhead);

      if (bookingDate < today) {
        return new Response(
          JSON.stringify({ error: "No se puede reservar en una fecha pasada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (bookingDate > maxDate) {
        return new Response(
          JSON.stringify({ error: `Solo se permiten reservas hasta ${maxDaysAhead} días en el futuro` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== ANTI-RACE-CONDITION: Revalidate slot =====
      const dayOfWeek = new Date(sessionDate).getDay();
      const slotStartMinutes = timeToMinutes(startTime);
      const slotEndMinutes = timeToMinutes(endTime);
      const centerTimezone = 'Europe/Madrid';

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

      // Check for conflicts with calendar events
      const startOfDay = `${sessionDate}T00:00:00`;
      const endOfDay = `${sessionDate}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("start_at, end_at, status, all_day")
        .eq("professional_id", finalProfessionalId)
        .eq("deleted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

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

      // ===== Upsert patient =====
      const normalizedEmail = patient.email.toLowerCase().trim();
      const normalizedPhone = (() => {
        if (!patient.phone) return null;
        let p = patient.phone.replace(/\s+/g, '').replace(/^\+34/, '');
        return p.length >= 9 ? p : null;
      })();

      // 1. Try to find existing patient by email
      const { data: existingByEmail } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, email, payment_mode, require_advance_payment_always")
        .eq("center_id", center.id)
        .ilike("email", normalizedEmail)
        .maybeSingle();

      // 2. If no match by email and phone provided, try by phone (only if patient has no email)
      let existingPatient = existingByEmail;
      if (!existingPatient && normalizedPhone) {
        const { data: existingByPhone } = await supabase
          .from("patients")
          .select("id, first_name, last_name, phone, email, payment_mode, require_advance_payment_always")
          .eq("center_id", center.id)
          .eq("phone", normalizedPhone)
          .is("email", null)
          .maybeSingle();
        existingPatient = existingByPhone;
      }

      let patientId: string;

      if (existingPatient) {
        patientId = existingPatient.id;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (!existingPatient.phone && normalizedPhone) updates.phone = normalizedPhone;
        if (!existingPatient.email) updates.email = normalizedEmail;
        if (Object.keys(updates).length > 1) {
          await supabase.from("patients").update(updates).eq("id", patientId);
        }
      } else {
        // Create new patient
        const { data: newPatient, error: patientError } = await supabase
          .from("patients")
          .insert({
            center_id: center.id,
            first_name: patient.firstName.trim(),
            last_name: patient.lastName.trim(),
            email: normalizedEmail,
            phone: normalizedPhone || patient.phone?.trim() || null,
            status: 'active'
          })
          .select("id")
          .single();

        if (patientError || !newPatient) {
          console.error("Error creating patient:", patientError);
          return new Response(
            JSON.stringify({ error: "Error al crear el paciente" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        patientId = newPatient.id;
      }

      // ===== Create session =====
      const sessionModality = location.location_type === 'online' ? 'online' : 'in_person';
      const status = center.portal_require_approval ? "pending_approval" : "scheduled";
      const { data: stripePaymentDefaults, error: stripeDefaultsError } = await supabase
        .from('professional_integrations')
        .select('stripe_enabled, stripe_payment_mode, stripe_scheduled_hours_before')
        .eq('professional_id', finalProfessionalId)
        .maybeSingle();

      if (stripeDefaultsError) {
        console.error('[create-booking] could not load professional Stripe payment defaults', {
          professionalId: finalProfessionalId,
          message: stripeDefaultsError.message,
        });
      }

      const professionalStripeMode = stripePaymentDefaults?.stripe_enabled
        ? stripePaymentDefaults.stripe_payment_mode
        : null;
      const paymentRules = resolvePaymentRules({
        patientPaymentMode: existingPatient?.payment_mode,
        patientRequireAdvancePaymentAlways: existingPatient?.require_advance_payment_always,
        // A patient override remains the highest priority. Otherwise use the
        // selected professional's Stripe setting before the center fallback.
        centerDefaultPaymentMode: professionalStripeMode || center.default_payment_mode,
        centerDefaultAdvancePaymentLimitHours: center.default_advance_payment_limit_hours,
        centerDefaultScheduledHoursBefore:
          stripePaymentDefaults?.stripe_scheduled_hours_before
          ?? center.default_scheduled_hours_before,
        sessionDate,
        startTime,
        price: sessionType.default_price || 0,
      });
      const cancellationPolicyState = await resolvePatientCancellationPolicyForSession(supabase, {
        centerId: center.id,
        patientId,
      });
      const sessionNotes = notes 
        ? `Reserva pública web\n${notes}` 
        : "Reserva pública web";

      const { data: newSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          center_id: center.id,
          patient_id: patientId,
          professional_id: finalProfessionalId,
          session_date: sessionDate,
          start_time: startTime,
          end_time: endTime,
          status,
          session_type: sessionType.name,
          session_modality: sessionModality,
          location_id: locationId,
          price: sessionType.default_price || 0,
          payment_mode: paymentRules.paymentMode,
          payment_status: paymentRules.paymentStatus,
          advance_payment_limit_hours: paymentRules.advancePaymentLimitHours,
          advance_payment_due_at: paymentRules.advancePaymentDueAt,
          ...cancellationPolicyState,
          notes: sessionNotes,
        })
        .select(`
          id, session_date, start_time, end_time, status, session_type, session_modality,
          professional:profiles!sessions_professional_id_fkey(first_name, last_name),
          location:center_locations(name, location_type)
        `)
        .single();

      if (sessionError || !newSession) {
        console.error("Error creating session:", sessionError);
        return new Response(
          JSON.stringify({ error: "Error al crear la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bonoResult = await autoApplyAvailableBonoToSession(supabase, {
        centerId: center.id,
        patientId,
        sessionId: newSession.id,
        shouldApply: status === "scheduled",
      });
      const bonoMessage = bonoResult.applied
        ? `Se ha descontado esta cita de tu bono. Sesiones pendientes: ${bonoResult.remainingSessions ?? 0}.`
        : undefined;

      // Required payment continues directly to Stripe. The newly-created
      // session reserves the slot while Checkout is in progress; only the
      // Stripe webhook confirms it after a successful card payment.
      const paymentRequiredNow = status !== "pending_approval"
        && !bonoResult.applied
        && paymentRules.paymentMode === 'required_now'
        && Number(sessionType.default_price || 0) > 0;
      let checkoutUrl: string | null = null;
      let checkoutError: string | null = null;

      if (paymentRequiredNow) {
        try {
          const { data: checkoutData, error: checkoutInvokeError } = await supabase.functions.invoke(
            'create-stripe-checkout',
            { body: { session_id: newSession.id } },
          );

          if (checkoutInvokeError || !checkoutData?.checkout_url) {
            checkoutError = checkoutInvokeError?.message || checkoutData?.error || 'No se pudo iniciar el pago seguro';
            console.error('[create-booking] required Stripe Checkout failed', {
              sessionId: newSession.id,
              message: checkoutError,
            });
          } else {
            checkoutUrl = checkoutData.checkout_url;
          }
        } catch (checkoutException) {
          checkoutError = checkoutException instanceof Error
            ? checkoutException.message
            : 'No se pudo iniciar el pago seguro';
          console.error('[create-booking] required Stripe Checkout exception', {
            sessionId: newSession.id,
            message: checkoutError,
          });
        }
      }

      // Send admin alert for new booking (replaces the empty recipient notification)
      const prof = Array.isArray(newSession.professional) ? newSession.professional[0] : newSession.professional;
      const loc = Array.isArray(newSession.location) ? newSession.location[0] : newSession.location;
      const professionalName = prof ? `${prof.first_name} ${prof.last_name}` : 'Sin asignar';
      const locationName = loc?.name || 'Sin especificar';
      
      const alertSubject = status === "pending_approval" 
        ? `Nueva solicitud de cita — ${patient.firstName} ${patient.lastName} — ${sessionDate} ${startTime}`
        : `Nueva cita reservada — ${patient.firstName} ${patient.lastName} — ${sessionDate} ${startTime}`;
      
      const alertMessage = buildAlertMessage({
        eventType: status === "pending_approval" ? 'Nueva solicitud de cita (reserva pública)' : 'Nueva cita reservada (reserva pública)',
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        sessionDate: sessionDate,
        sessionTime: startTime,
        professionalName,
        modality: sessionModality,
        locationName,
        status: status === "pending_approval" ? 'Pendiente de aprobación' : 'Confirmada',
      });

      await sendAdminAlert({
        supabase,
        centerId: center.id,
        eventKey: 'booking_created',
        subject: alertSubject,
        message: alertMessage,
        patientId,
        sessionId: newSession.id,
        professionalId: finalProfessionalId,
      });

      // Generate booking token (async now for HMAC signing)
      const bookingToken = await generateBookingToken(newSession.id, patientId, center.id);
      const manageUrl = `/book/${centerSlug}/manage?token=${bookingToken}`;

      console.log(`[create-booking] success sessionId=${newSession.id} status=${status}`);

      // Send patient confirmation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: center.id,
        patientId,
        sessionId: newSession.id,
        eventType: 'created',
        sessionDate,
        startTime,
        sessionType: sessionType.name,
        sessionModality,
        locationName,
        manageUrl,
        includeAdvancePaymentBlock: status !== "pending_approval" && !bonoResult.applied,
        extraMessage: bonoMessage,
      });

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Notify professional (email or WhatsApp depending on center config)
      if (finalProfessionalId) {
        await notifyProfessionalBooking({
          supabase,
          centerId: center.id,
          professionalId: finalProfessionalId,
          patientId,
          sessionId: newSession.id,
          eventType: 'created',
          sessionDate,
          startTime,
          sessionType: sessionType.name,
          sessionModality,
          locationName,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: newSession,
          bookingToken,
          manageUrl,
          paymentRequired: paymentRequiredNow,
          checkoutUrl,
          checkoutError,
          message: center.portal_require_approval
            ? "Cita solicitada. Recibirás confirmación pronto."
            : paymentRequiredNow
              ? checkoutUrl
                ? "Continúa con el pago seguro para confirmar tu cita."
                : "La cita está pendiente de pago. Usa el enlace enviado para completarlo."
              : "¡Cita reservada correctamente!"
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET-BOOKING =====
    if (action === "get-booking") {
      const { bookingToken } = params;

      if (!bookingToken) {
        return new Response(
          JSON.stringify({ error: "Token requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await verifyBookingToken(bookingToken);
      if (!tokenData.valid || !tokenData.sessionId) {
        return new Response(
          JSON.stringify({ error: "Token inválido o expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: session, error } = await supabase
        .from("sessions")
        .select(`
          id, session_date, start_time, end_time, status, session_type, session_modality, cancellation_policy,
          session_type_id, professional_id, location_id,
          professional:profiles!sessions_professional_id_fkey(id, first_name, last_name),
          location:center_locations(id, name, location_type, street, city)
        `)
        .eq("id", tokenData.sessionId)
        .eq("patient_id", tokenData.patientId)
        .single();


      if (error || !session) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolve session_type_id by name if missing (legacy sessions)
      if (!session.session_type_id && session.session_type) {
        const { data: st } = await supabase
          .from("session_types")
          .select("id")
          .eq("center_id", tokenData.centerId)
          .eq("name", session.session_type)
          .eq("is_public", true)
          .eq("is_active", true)
          .maybeSingle();
        if (st?.id) session.session_type_id = st.id;
      }

      // Get center info
      const { data: center } = await supabase
        .from("centers")
        .select("name, portal_slug")
        .eq("id", tokenData.centerId)
        .single();


      return new Response(
        JSON.stringify({ 
          booking: session,
          centerName: center?.name,
          centerSlug: center?.portal_slug 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== CANCEL-BOOKING =====
    if (action === "cancel-booking") {
      const { bookingToken, reason } = params;

      if (!bookingToken) {
        return new Response(
          JSON.stringify({ error: "Token requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await verifyBookingToken(bookingToken);
      if (!tokenData.valid || !tokenData.sessionId) {
        return new Response(
          JSON.stringify({ error: "Token inválido o expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session
      const { data: session } = await supabase
        .from("sessions")
        .select("id, patient_id, professional_id, center_id, session_date, start_time, session_type, session_type_id, status, cancellation_policy, cancellation_policy_version_id, google_calendar_event_id, price")
        .eq("id", tokenData.sessionId)
        .eq("patient_id", tokenData.patientId)
        .single();


      if (!session) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.status === 'cancelled') {
        return new Response(
          JSON.stringify({ error: "La cita ya está cancelada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
      const now = new Date();

      const signedCancellationPolicy = await resolveSignedCancellationPolicyVersionForSession(supabase, {
        centerId: session.center_id,
        patientId: session.patient_id,
        policyVersionId: session.cancellation_policy_version_id,
        versionSelect: "id, rules, penalty_invoice_concept",
      });

      const signedPolicyEvaluation = signedCancellationPolicy
        ? evaluateCancellationCharge({
          rules: signedCancellationPolicy.rules,
          sessionStartsAt: sessionDateTime,
          cancelledAt: now,
          basePrice: await resolveCancellationBasePrice(supabase, {
            centerId: session.center_id,
            patientId: session.patient_id,
            sessionTypeId: session.session_type_id,
            sessionTypeName: session.session_type,
            sessionDate: session.session_date,
            sessionPrice: session.price,
          }),
        })
        : null;

      const cancellationReviewMessage = signedPolicyEvaluation?.applies
        ? `Cancelacion fuera de plazo. Se ha creado un cargo pendiente de revision por ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : signedCancellationPolicy
          ? "Cancelacion dentro del plazo de la politica firmada. No se crea cargo."
          : "El paciente no tiene politica de cancelacion firmada. No se crea cargo.";
      const patientCancellationPolicyMessage = signedPolicyEvaluation?.applies
        ? `Tu cancelacion queda pendiente de revision segun la politica aceptada. Importe estimado sujeto a revision: ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : undefined;
      const professionalCancellationPolicyMessage = signedPolicyEvaluation?.applies
        ? `Se ha creado una cancelacion pendiente de revision segun la politica aceptada. Importe estimado: ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : undefined;

      // Cancel session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          status: "cancelled",
          cancellation_origin: "patient",
          cancellation_reason: reason || "Cancelada por el paciente desde reserva pública"
        })
        .eq("id", session.id);

      if (updateError) {
        console.error("Error cancelling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al cancelar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (signedPolicyEvaluation?.applies && signedCancellationPolicy) {
        const { error: chargeError } = await supabase
          .from("cancellation_charges")
          .insert({
            center_id: session.center_id,
            patient_id: session.patient_id,
            session_id: session.id,
            policy_version_id: signedCancellationPolicy.id,
            status: "pending_review",
            amount: signedPolicyEvaluation.amount,
            original_amount: signedPolicyEvaluation.amount,
            percentage: signedPolicyEvaluation.percentage,
            base_session_price: signedPolicyEvaluation.basePrice,
            concept: signedCancellationPolicy.penalty_invoice_concept || "Cancelacion fuera de plazo segun politica aceptada",
            review_note: reason || "Cancelacion solicitada por el paciente desde reserva publica",
          });

        if (chargeError) {
          console.error("Error creating cancellation charge:", chargeError);
        }
      }

      // Get patient and professional info for alert
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email, phone")
        .eq("id", session.patient_id)
        .single();

      const { data: sessionFull } = await supabase
        .from("sessions")
        .select("professional_id, center_id")
        .eq("id", session.id)
        .single();

      if (patientData && sessionFull) {
        const alertMessage = buildAlertMessage({
          eventType: 'Cita cancelada por el cliente (reserva pública)',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          patientPhone: patientData.phone,
          sessionDate: session.session_date,
          sessionTime: session.start_time,
          details: `${reason || 'Sin motivo especificado'}\n\n${cancellationReviewMessage}`,
        });

        await sendAdminAlert({
          supabase,
          centerId: sessionFull.center_id,
          eventKey: 'booking_cancelled',
          subject: `Cita cancelada — ${patientData.first_name} ${patientData.last_name} — ${session.session_date} ${session.start_time}`,
          message: alertMessage,
          patientId: session.patient_id,
          sessionId: session.id,
          professionalId: sessionFull.professional_id,
        });
      }

      console.log(`[cancel-booking] success sessionId=${session.id}`);

      // Delete event from Google Calendar if linked
      if (session.google_calendar_event_id && session.professional_id) {
        try {
          await supabase.functions.invoke('update-google-calendar-event', {
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: {
              professional_id: session.professional_id,
              event_id: session.google_calendar_event_id,
              status: 'cancelled',
            },
          });
        } catch (err) {
          console.error('[cancel-booking] Google Calendar sync failed:', err);
        }
      }


      // Send patient cancellation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: sessionFull?.center_id || tokenData.centerId!,
        patientId: session.patient_id,
        sessionId: session.id,
        eventType: 'cancelled',
        sessionDate: session.session_date,
        startTime: session.start_time,
        reason: reason || undefined,
        extraMessage: patientCancellationPolicyMessage,
      });

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Notify professional (email or WhatsApp depending on center config)
      if (sessionFull?.professional_id) {
        await notifyProfessionalBooking({
          supabase,
          centerId: sessionFull.center_id || tokenData.centerId!,
          professionalId: sessionFull.professional_id,
          patientId: session.patient_id,
          sessionId: session.id,
          eventType: 'cancelled',
          sessionDate: session.session_date,
          startTime: session.start_time,
          reason: reason || undefined,
          extraMessage: professionalCancellationPolicyMessage,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: signedPolicyEvaluation?.applies
            ? "Cita cancelada. Tu profesional revisara la politica de cancelacion aplicable."
            : "Cita cancelada correctamente",
          cancellationChargePendingReview: signedPolicyEvaluation?.applies || false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== RESCHEDULE-BOOKING =====
    if (action === "reschedule-booking") {
      const { bookingToken, newDate, newStartTime, newEndTime } = params;

      if (!bookingToken || !newDate || !newStartTime || !newEndTime) {
        return new Response(
          JSON.stringify({ error: "Faltan parámetros requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await verifyBookingToken(bookingToken);
      if (!tokenData.valid || !tokenData.sessionId) {
        return new Response(
          JSON.stringify({ error: "Token inválido o expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get current session
      const { data: session } = await supabase
        .from("sessions")
        .select("id, patient_id, professional_id, location_id, session_date, start_time, end_time, status, cancellation_policy, google_calendar_event_id, notes, zoom_meeting_id")
        .eq("id", tokenData.sessionId)
        .eq("patient_id", tokenData.patientId)
        .single();


      if (!session) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.status === 'cancelled') {
        return new Response(
          JSON.stringify({ error: "No se puede reprogramar una cita cancelada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate new date is within allowed range
      const { data: centerForReschedule } = await supabase
        .from("centers")
        .select("reschedule_max_days")
        .eq("id", tokenData.centerId)
        .single();

      const maxDaysAhead = centerForReschedule?.reschedule_max_days ?? 90;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newBookingDate = new Date(newDate);
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + maxDaysAhead);

      if (newBookingDate < today) {
        return new Response(
          JSON.stringify({ error: "No se puede reprogramar a una fecha pasada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (newBookingDate > maxDate) {
        return new Response(
          JSON.stringify({ error: `Solo se permite reprogramar hasta ${maxDaysAhead} días en el futuro` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check cancellation policy (applies to reschedule too)
      const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
      const now = new Date();
      const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const requiredHours = policyHoursMap[session.cancellation_policy || "24_hours"] || 24;

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

      // ===== ANTI-RACE-CONDITION: Validate new slot =====
      const dayOfWeek = new Date(newDate).getDay();
      const slotStartMinutes = timeToMinutes(newStartTime);
      const slotEndMinutes = timeToMinutes(newEndTime);
      const centerTimezone = 'Europe/Madrid';

      // Check professional availability
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("start_time, end_time")
        .eq("professional_id", session.professional_id)
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      const profAvailable = profAvailability?.some(slot => {
        const profStart = timeToMinutes(slot.start_time);
        const profEnd = timeToMinutes(slot.end_time);
        return slotStartMinutes >= profStart && slotEndMinutes <= profEnd;
      });

      if (!profAvailable) {
        return new Response(
          JSON.stringify({ error: "Ese horario ya no está disponible" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check location schedule
      const { data: locationSchedule } = await supabase
        .from("location_schedules")
        .select("start_time, end_time")
        .eq("location_id", session.location_id)
        .eq("day_of_week", dayOfWeek)
        .eq("is_open", true);

      const locationOpen = locationSchedule?.some(schedule => {
        const locStart = timeToMinutes(schedule.start_time);
        const locEnd = timeToMinutes(schedule.end_time);
        return slotStartMinutes >= locStart && slotEndMinutes <= locEnd;
      });

      if (!locationOpen) {
        return new Response(
          JSON.stringify({ error: "La ubicación no está disponible en ese horario" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check conflicts with existing sessions (excluding current session)
      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("id, start_time, end_time")
        .eq("professional_id", session.professional_id)
        .eq("session_date", newDate)
        .not("status", "in", '("cancelled","no_show")')
        .neq("id", session.id);

      const hasSessionConflict = existingSessions?.some(s => {
        const sessionStart = timeToMinutes(s.start_time.substring(0, 5));
        const sessionEnd = timeToMinutes(s.end_time.substring(0, 5));
        return slotStartMinutes < sessionEnd && slotEndMinutes > sessionStart;
      });

      if (hasSessionConflict) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check calendar events
      const startOfDay = `${newDate}T00:00:00`;
      const endOfDay = `${newDate}T23:59:59`;

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("start_at, end_at, status, all_day")
        .eq("professional_id", session.professional_id)
        .eq("deleted", false)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay);

      const hasCalendarConflict = calendarEvents?.some(event => {
        if (event.status === 'cancelled') return false;
        if (event.all_day) return true;

        const eventStartMinutes = getLocalTimeMinutes(event.start_at, centerTimezone);
        const eventEndMinutes = getLocalTimeMinutes(event.end_at, centerTimezone);

        return slotStartMinutes < eventEndMinutes && slotEndMinutes > eventStartMinutes;
      });

      if (hasCalendarConflict) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({
          session_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id);

      if (updateError) {
        console.error("Error rescheduling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al reprogramar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.zoom_meeting_id) {
        try {
          const zoomSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-zoom-meeting`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "apikey": supabaseServiceKey,
            },
            body: JSON.stringify({
              professional_id: session.professional_id,
              meeting_id: session.zoom_meeting_id,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
            }),
          });
          if (!zoomSyncResponse.ok) {
            console.error("[reschedule-booking] Zoom sync failed:", await zoomSyncResponse.text());
          }
        } catch (zoomError) {
          console.error("[reschedule-booking] Error syncing to Zoom:", zoomError);
        }
      }

      // Get patient info for alert
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email")
        .eq("id", session.patient_id)
        .single();

      if (patientData && tokenData.centerId) {
        const alertMessage = buildAlertMessage({
          eventType: 'Cita reprogramada por el cliente (reserva pública)',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          oldDate: session.session_date,
          oldTime: session.start_time,
          newDate: newDate,
          newTime: newStartTime,
        });

        await sendAdminAlert({
          supabase,
          centerId: tokenData.centerId,
          eventKey: 'booking_rescheduled',
          subject: `Cita reprogramada — ${patientData.first_name} ${patientData.last_name}`,
          message: alertMessage,
          patientId: session.patient_id,
          sessionId: session.id,
          professionalId: session.professional_id,
        });
      }

      console.log(`[reschedule-booking] success sessionId=${session.id} newDate=${newDate}`);

      // Sync to Google Calendar if linked
      if (session.professional_id) {
        try {
          const { data: gcalResult, error: gcalError } = await supabase.functions.invoke('update-google-calendar-event', {
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: {
              professional_id: session.professional_id,
              event_id: session.google_calendar_event_id || null,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              psycma_session_id: session.id,
              description: session.notes || '',
              create_if_not_exists: true,
              color_id: null, // reset confirmation color on reschedule
            },
          });
          if (gcalError) {
            console.error('[reschedule-booking] Google Calendar sync error:', gcalError);
          } else if (gcalResult?.event_id && gcalResult.event_id !== session.google_calendar_event_id) {
            await supabase
              .from('sessions')
              .update({ google_calendar_event_id: gcalResult.event_id })
              .eq('id', session.id);
          }
        } catch (err) {
          console.error('[reschedule-booking] Google Calendar sync failed:', err);
        }
      }


      // Send patient reschedule notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: tokenData.centerId!,
        patientId: session.patient_id,
        sessionId: session.id,
        eventType: 'rescheduled',
        sessionDate: newDate,
        startTime: newStartTime,
        oldDate: session.session_date,
        oldTime: session.start_time,
      });

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Notify professional (email or WhatsApp depending on center config)
      if (session.professional_id) {
        await notifyProfessionalBooking({
          supabase,
          centerId: tokenData.centerId!,
          professionalId: session.professional_id,
          patientId: session.patient_id,
          sessionId: session.id,
          eventType: 'rescheduled',
          sessionDate: newDate,
          startTime: newStartTime,
          oldDate: session.session_date,
          oldTime: session.start_time,
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Cita reprogramada correctamente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== SUBMIT-INTAKE-REQUEST =====
    if (action === "submit-intake-request") {
      const { 
        firstName, lastName, email, phone, requestType, modality, city, notes,
        // New privacy and referral wizard fields
        privacyAccepted, privacyPolicyUrl, specialty, referralContext,
        selectedPartnerId, recommendedPartnerIds
      } = params;

      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!firstName || !lastName || !email || !requestType) {
        return new Response(
          JSON.stringify({ error: "Faltan campos obligatorios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["waitlist", "referral"].includes(requestType)) {
        return new Response(
          JSON.stringify({ error: "Tipo de solicitud no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== NEW: Privacy validation =====
      if (privacyAccepted !== true) {
        return new Response(
          JSON.stringify({ error: "Debes aceptar la política de privacidad" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate privacy policy URL contains required path
      const requiredPrivacyPath = "politica-de-privacidad";
      if (!privacyPolicyUrl || !privacyPolicyUrl.includes(requiredPrivacyPath)) {
        return new Response(
          JSON.stringify({ error: "URL de política de privacidad no válida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== NEW: Referral-specific validations =====
      if (requestType === "referral") {
        if (!specialty) {
          return new Response(
            JSON.stringify({ error: "La especialidad es obligatoria para derivaciones" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // referralContext should contain modality
        const refContext = referralContext || {};
        const refModality = refContext.modality || modality;
        
        if (!refModality) {
          return new Response(
            JSON.stringify({ error: "La modalidad es obligatoria para derivaciones" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // If presencial, province or city required
        if (refModality === "presencial") {
          const hasLocation = refContext.province || refContext.city || city;
          if (!hasLocation) {
            return new Response(
              JSON.stringify({ error: "Indica tu provincia o ciudad para sesiones presenciales" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Get center ID from slug
      const { data: center, error: centerError } = await supabase
        .from("centers")
        .select("id, public_booking_enabled, portal_agenda_closed")
        .eq("portal_slug", centerSlug)
        .single();

      if (centerError || !center) {
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!center.public_booking_enabled) {
        return new Response(
          JSON.stringify({ error: "Reservas públicas no habilitadas", disabled: true }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert the intake request with new fields
      const { data: intakeRequest, error: insertError } = await supabase
        .from("portal_intake_requests")
        .insert({
          center_id: center.id,
          request_type: requestType,
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: phone || null,
          modality: modality || null,
          city: city || null,
          notes: notes || null,
          status: "pending",
          // New fields
          privacy_accepted: true,
          privacy_accepted_at: new Date().toISOString(),
          privacy_policy_url: privacyPolicyUrl,
          specialty: specialty || null,
          referral_context: referralContext || null,
          selected_partner_id: selectedPartnerId || null,
          recommended_partner_ids: recommendedPartnerIds || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[submit-intake-request] Error inserting:", insertError);
        return new Response(
          JSON.stringify({ error: "Error al guardar la solicitud" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[submit-intake-request] success requestId=${intakeRequest.id} type=${requestType} privacy=true`);

      // Send admin alert
      const alertMessage = buildAlertMessage({
        eventType: requestType === 'waitlist' ? 'Nueva solicitud de lista de espera' : 'Nueva solicitud de derivación',
        patientName: `${firstName} ${lastName}`,
        patientEmail: email,
        ...(modality && { notes: `Modalidad: ${modality}${city ? `, Ciudad: ${city}` : ''}${specialty ? `, Especialidad: ${specialty}` : ''}` }),
      });

      await sendAdminAlert({
        supabase,
        centerId: center.id,
        eventKey: 'booking_request',
        subject: requestType === 'waitlist' 
          ? `Nueva solicitud de lista de espera — ${firstName} ${lastName}`
          : `Nueva solicitud de derivación — ${firstName} ${lastName}`,
        message: alertMessage,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: requestType === 'waitlist' 
            ? "Te hemos añadido a la lista de espera" 
            : "Hemos recibido tu solicitud de derivación"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LIST-REFERRAL-FILTERS =====
    if (action === "list-referral-filters") {
      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center ID from slug
      const { data: center, error: centerError } = await supabase
        .from("centers")
        .select("id, public_booking_enabled")
        .eq("portal_slug", centerSlug)
        .single();

      if (centerError || !center) {
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get active specialties
      const { data: specialties, error: specError } = await supabase
        .from("referral_specialties")
        .select("id, name")
        .eq("center_id", center.id)
        .eq("active", true)
        .order("priority", { ascending: true })
        .order("name", { ascending: true });

      if (specError) {
        console.error("[list-referral-filters] Error fetching specialties:", specError);
      }

      // Get unique provinces/cities from active presencial partners
      const { data: partners, error: partnersError } = await supabase
        .from("referral_partners")
        .select("provinces, cities, modality")
        .eq("center_id", center.id)
        .eq("active", true);

      if (partnersError) {
        console.error("[list-referral-filters] Error fetching partners:", partnersError);
      }

      // Extract unique provinces and cities from partners with presencial modality
      const provincesSet = new Set<string>();
      const citiesSet = new Set<string>();

      (partners || []).forEach(p => {
        // Check if partner supports presencial
        if (p.modality && Array.isArray(p.modality) && p.modality.includes("presencial")) {
          if (p.provinces && Array.isArray(p.provinces)) {
            p.provinces.forEach((prov: string) => {
              if (prov && prov.trim()) provincesSet.add(prov.trim());
            });
          }
          if (p.cities && Array.isArray(p.cities)) {
            p.cities.forEach((city: string) => {
              if (city && city.trim()) citiesSet.add(city.trim());
            });
          }
        }
      });

      const provinces = Array.from(provincesSet).sort();
      const cities = Array.from(citiesSet).sort();

      console.log(`[list-referral-filters] centerSlug=${centerSlug} specialties=${(specialties || []).length} provinces=${provinces.length} cities=${cities.length}`);

      return new Response(
        JSON.stringify({
          specialties: specialties || [],
          provinces,
          cities
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET-REFERRAL-RECOMMENDATIONS =====
    if (action === "get-referral-recommendations") {
      const { modality: reqModality, specialty: reqSpecialty, province: reqProvince, city: reqCity } = params;

      if (!centerSlug) {
        return new Response(
          JSON.stringify({ error: "centerSlug es requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!reqModality || !reqSpecialty) {
        return new Response(
          JSON.stringify({ error: "modality y specialty son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center ID from slug
      const { data: center, error: centerError } = await supabase
        .from("centers")
        .select("id, public_booking_enabled")
        .eq("portal_slug", centerSlug)
        .single();

      if (centerError || !center) {
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get active partners
      const { data: allPartners, error: partnersError } = await supabase
        .from("referral_partners")
        .select("id, name, surname, public_name, description, website, phone, email, modality, provinces, cities, specialties, priority")
        .eq("center_id", center.id)
        .eq("active", true)
        .order("priority", { ascending: true });

      if (partnersError) {
        console.error("[get-referral-recommendations] Error fetching partners:", partnersError);
        return new Response(
          JSON.stringify({ error: "Error al obtener recomendaciones" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Filter partners based on criteria
      const filteredPartners = (allPartners || []).filter(partner => {
        // Check modality match
        if (!partner.modality || !Array.isArray(partner.modality)) return false;
        if (!partner.modality.includes(reqModality)) return false;

        // Check specialty match (required, skip if specialties is empty/null)
        if (!partner.specialties || !Array.isArray(partner.specialties) || partner.specialties.length === 0) {
          return false;
        }
        const specialtyMatch = partner.specialties.some((s: string) => 
          s.toLowerCase().trim() === reqSpecialty.toLowerCase().trim()
        );
        if (!specialtyMatch) return false;

        // If presencial and location provided, check location match
        if (reqModality === "presencial" && (reqCity || reqProvince)) {
          const cityMatch = reqCity && partner.cities && Array.isArray(partner.cities) && 
            partner.cities.some((c: string) => c.toLowerCase().trim() === reqCity.toLowerCase().trim());
          
          const provinceMatch = reqProvince && partner.provinces && Array.isArray(partner.provinces) &&
            partner.provinces.some((p: string) => p.toLowerCase().trim() === reqProvince.toLowerCase().trim());

          // Partner matches if city OR province matches
          if (!cityMatch && !provinceMatch) return false;
        }

        return true;
      });

      // Limit to 6 results
      const limitedPartners = filteredPartners.slice(0, 6);

      // Format response
      const recommendations = limitedPartners.map(p => ({
        id: p.id,
        name: p.name,
        surname: p.surname,
        publicName: p.public_name || `${p.name}${p.surname ? ' ' + p.surname : ''}`,
        description: p.description,
        website: p.website,
        phone: p.phone,
        email: p.email,
        modalities: p.modality,
        provinces: p.provinces,
        cities: p.cities,
        specialties: p.specialties
      }));

      console.log(`[get-referral-recommendations] centerSlug=${centerSlug} modality=${reqModality} specialty=${reqSpecialty} found=${recommendations.length}`);

      return new Response(
        JSON.stringify({ partners: recommendations }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[public-booking] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

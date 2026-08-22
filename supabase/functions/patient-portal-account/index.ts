import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tokenSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function validateSession(sessionToken: string): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) return { valid: false };
    const data = atob(payloadB64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(tokenSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signature = Uint8Array.from(atob(signatureB64), (character) => character.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));
    if (!valid) return { valid: false };
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return { valid: false };
    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch {
    return { valid: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { action, sessionToken } = await req.json();
    const session = await validateSession(sessionToken);
    if (!session.valid || !session.patientId || !session.centerId) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action !== "get") {
      return new Response(JSON.stringify({ error: "Acción no válida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const [patientResult, centerResult, locationsResult] = await Promise.all([
      supabase.from("patients").select("first_name, last_name, email, phone, address, city, postal_code").eq("id", session.patientId).eq("center_id", session.centerId).single(),
      supabase.from("centers").select("name, email, phone, address, address_details, city, province, postal_code, country, session_reminder_enabled, session_reminder_channels").eq("id", session.centerId).single(),
      supabase.from("center_locations").select("id, name, street, number_details, city, postal_code, country, location_type").eq("center_id", session.centerId).eq("is_active", true).eq("is_public", true).order("name"),
    ]);
    if (patientResult.error || !patientResult.data || centerResult.error || !centerResult.data || locationsResult.error) {
      throw patientResult.error || centerResult.error || locationsResult.error || new Error("Account data not found");
    }

    const rawChannels = centerResult.data.session_reminder_channels;
    const reminderChannels = rawChannels && typeof rawChannels === "object" && !Array.isArray(rawChannels)
      ? Object.entries(rawChannels).filter(([, enabled]) => enabled === true).map(([channel]) => channel)
      : [];

    const response = {
      patient: {
        firstName: patientResult.data.first_name,
        lastName: patientResult.data.last_name,
        email: patientResult.data.email,
        phone: patientResult.data.phone,
        address: patientResult.data.address,
        city: patientResult.data.city,
        postalCode: patientResult.data.postal_code,
      },
      center: {
        name: centerResult.data.name,
        email: centerResult.data.email,
        phone: centerResult.data.phone,
        address: centerResult.data.address,
        addressDetails: centerResult.data.address_details,
        city: centerResult.data.city,
        province: centerResult.data.province,
        postalCode: centerResult.data.postal_code,
        country: centerResult.data.country,
      },
      communications: {
        remindersEnabled: !!centerResult.data.session_reminder_enabled,
        reminderChannels,
      },
      locations: locationsResult.data || [],
    };

    logAuditEvent({
      supabase, req,
      userId: null, userRole: "patient",
      organizationId: session.centerId,
      patientId: session.patientId,
      resourceType: "patient_account", action: "VIEW",
      routeOrEndpoint: "patient-portal-account/get",
    });

    return new Response(JSON.stringify(response), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Patient portal account error:", error);
    return new Response(JSON.stringify({ error: "Error al obtener los datos de la cuenta" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

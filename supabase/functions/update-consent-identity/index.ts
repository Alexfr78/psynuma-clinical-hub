import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fillIdentityPlaceholders,
  getPendingIdentityFields,
  normalizeIdentityDocument,
  validateIdentityDocument,
  type IdentityField,
} from "../_shared/consentIdentity.ts";

// Completa el DNI/NIE que faltaba en un consentimiento pendiente de firma
// (paciente, o tutor si es menor). Lo escribe en el documento antes de firmar,
// para que quede en el PDF firmado, y lo copia a la ficha solo si estaba vacío.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-consent-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const consentToken = req.headers.get("x-consent-token");
    if (!consentToken) {
      return json({ error: "No consent token provided" }, 401);
    }

    const body = await req.json();
    const { consent_id } = body;
    const submitted: Record<IdentityField, unknown> = {
      patient: body.patient_tax_id,
      guardian: body.guardian_tax_id,
    };

    if (!consent_id) {
      return json({ error: "Missing required fields" }, 400);
    }

    const { data: consent, error: consentError } = await supabase
      .from("consents")
      .select("id, status, expires_at, patient_id, content_snapshot, signatures:consent_signatures(id)")
      .eq("id", consent_id)
      .eq("access_token", consentToken)
      .single();

    if (consentError || !consent) {
      return json({ error: "Invalid consent or token" }, 403);
    }

    if (consent.status !== "pending") {
      return json({ error: "Consent is not in pending status" }, 400);
    }

    if (consent.expires_at && new Date(consent.expires_at) < new Date()) {
      return json({ error: "Consent has expired" }, 400);
    }

    // Una vez que alguien ha firmado, el texto firmado no puede cambiar.
    if (Array.isArray(consent.signatures) && consent.signatures.length > 0) {
      return json({ error: "Consent already has signatures" }, 400);
    }

    const pending = getPendingIdentityFields(consent.content_snapshot);
    if (pending.length === 0) {
      return json({ success: true });
    }

    const values: Partial<Record<IdentityField, string>> = {};
    for (const field of pending) {
      const raw = typeof submitted[field] === "string" ? (submitted[field] as string) : "";
      const validation = validateIdentityDocument(raw);
      if (!validation.valid) {
        return json({ error: validation.message || "DNI/NIE no válido", field }, 400);
      }
      values[field] = normalizeIdentityDocument(raw);
    }

    const { data: updated, error: consentUpdateError } = await supabase
      .from("consents")
      .update({ content_snapshot: fillIdentityPlaceholders(consent.content_snapshot, values) })
      .eq("id", consent_id)
      .eq("status", "pending")
      .select("id");

    if (consentUpdateError) {
      console.error("Error updating consent identity:", consentUpdateError);
      return json({ error: "Failed to save identity document" }, 500);
    }
    if (!updated || updated.length === 0) {
      return json({ error: "Consent is not in pending status" }, 409);
    }

    // La ficha solo se completa, nunca se sobrescribe: `tax_id` es también el
    // NIF de las facturas y puede haberlo corregido el centro.
    const patientUpdates: Array<{ column: "tax_id" | "guardian_tax_id"; value: string }> = [];
    if (values.patient) patientUpdates.push({ column: "tax_id", value: values.patient });
    if (values.guardian) patientUpdates.push({ column: "guardian_tax_id", value: values.guardian });

    for (const { column, value } of patientUpdates) {
      const { error: patientUpdateError } = await supabase
        .from("patients")
        .update({ [column]: value })
        .eq("id", consent.patient_id)
        .or(`${column}.is.null,${column}.eq.`);

      if (patientUpdateError) {
        // El documento ya está completo; un fallo aquí no debe bloquear la firma.
        console.error(`Error updating patient ${column}:`, patientUpdateError);
      }
    }

    return json({ success: true }, 200);
  } catch (error) {
    console.error("Error in update-consent-identity:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

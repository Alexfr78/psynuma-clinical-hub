import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-consent-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
      return new Response(
        JSON.stringify({ error: "No consent token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { consent_id, emergency_contact_name, emergency_contact_phone } = body;

    const trimmedName = typeof emergency_contact_name === "string" ? emergency_contact_name.trim() : "";
    const trimmedPhone = typeof emergency_contact_phone === "string" ? emergency_contact_phone.trim() : "";

    if (!consent_id || !trimmedName || !trimmedPhone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify that the consent exists, matches the token, and is still editable
    const { data: consent, error: consentError } = await supabase
      .from("consents")
      .select("id, status, expires_at, patient_id")
      .eq("id", consent_id)
      .eq("access_token", consentToken)
      .single();

    if (consentError || !consent) {
      return new Response(
        JSON.stringify({ error: "Invalid consent or token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (consent.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Consent is not in pending status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(consent.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Consent has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Snapshot the values on the consent itself (kept even if the patient's file changes later)
    const { error: consentUpdateError } = await supabase
      .from("consents")
      .update({
        emergency_contact_name: trimmedName,
        emergency_contact_phone: trimmedPhone,
      })
      .eq("id", consent_id);

    if (consentUpdateError) {
      console.error("Error updating consent emergency contact:", consentUpdateError);
      return new Response(
        JSON.stringify({ error: "Failed to save emergency contact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Keep the patient's file in sync with the latest emergency contact
    const { error: patientUpdateError } = await supabase
      .from("patients")
      .update({
        emergency_contact_name: trimmedName,
        emergency_contact_phone: trimmedPhone,
      })
      .eq("id", consent.patient_id);

    if (patientUpdateError) {
      console.error("Error updating patient emergency contact:", patientUpdateError);
      return new Response(
        JSON.stringify({ error: "Failed to update patient record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in update-consent-emergency-contact:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

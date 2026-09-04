import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeVerificationCheckboxes } from "../_shared/consent.ts";

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

    // Get client IP from headers (Cloudflare/proxy headers first, then fallback)
    const cfConnectingIp = req.headers.get("cf-connecting-ip");
    const xRealIp = req.headers.get("x-real-ip");
    const xForwardedFor = req.headers.get("x-forwarded-for");
    
    const clientIp = 
      cfConnectingIp ||
      xRealIp ||
      xForwardedFor?.split(",")[0]?.trim() ||
      null;

    console.log("IP Detection:", { cfConnectingIp, xRealIp, xForwardedFor, resolvedIp: clientIp });

    const userAgent = req.headers.get("user-agent") || null;

    const body = await req.json();
    const { consent_id, signer_name, signer_role, signature_order, signature_data } = body;

    if (!consent_id || !signer_name || !signer_role || signature_order === undefined || !signature_data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify that the consent exists and matches the token
    const { data: consent, error: consentError } = await supabase
      .from("consents")
      .select("id, status, expires_at, requires_guardian, cancellation_policy_version_id, verification_responses, template:consent_templates(verification_checkboxes)")
      .eq("id", consent_id)
      .eq("access_token", consentToken)
      .single();

    if (consentError || !consent) {
      return new Response(
        JSON.stringify({ error: "Invalid consent or token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if consent is still pending and not expired
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

    if (signer_role !== "patient" && signer_role !== "guardian") {
      return new Response(
        JSON.stringify({ error: "Invalid signer role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A cancellation policy is only valid when every verification is an
    // explicit affirmative answer. The server enforces this independently of
    // the browser so a refusal can never be stored as a signed policy.
    if (signer_role === "patient" && consent.cancellation_policy_version_id) {
      const template = Array.isArray(consent.template) ? consent.template[0] : consent.template;
      const checkboxes = normalizeVerificationCheckboxes(template?.verification_checkboxes);
      const responses = consent.verification_responses && typeof consent.verification_responses === "object"
        ? consent.verification_responses as Record<string, unknown>
        : {};
      const accepted = checkboxes.length > 0
        && checkboxes.every((checkbox) => responses[checkbox.key] === true);

      if (!accepted) {
        return new Response(
          JSON.stringify({ error: "La política de cancelación requiere una aceptación expresa" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (signer_role === "patient" && consent.requires_guardian) {
      const { data: guardianSignature } = await supabase
        .from("consent_signatures")
        .select("id")
        .eq("consent_id", consent_id)
        .eq("signer_role", "guardian")
        .maybeSingle();

      if (!guardianSignature) {
        return new Response(
          JSON.stringify({ error: "Guardian signature is required first" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Insert the signature with the real IP address
    const { data: signature, error: insertError } = await supabase
      .from("consent_signatures")
      .insert({
        consent_id,
        signer_name,
        signer_role,
        signature_order,
        signature_data,
        ip_address: clientIp,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting signature:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save signature" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (signer_role === "patient") {
      const { error: completeError } = await supabase
        .from("consents")
        .update({ status: "signed", signed_at: new Date().toISOString() })
        .eq("id", consent_id)
        .eq("status", "pending");

      if (completeError) {
        console.error("Error completing consent:", completeError);
        await supabase.from("consent_signatures").delete().eq("id", signature.id);
        return new Response(
          JSON.stringify({ error: "Failed to complete consent" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: signature, consent_completed: signer_role === "patient" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in submit-consent-signature:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

    // Get client IP from headers (Cloudflare/proxy headers first, then fallback)
    const clientIp = 
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

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
      .select("id, status, expires_at")
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

    return new Response(
      JSON.stringify({ success: true, data: signature }),
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

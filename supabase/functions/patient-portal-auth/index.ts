import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, ...params } = await req.json();

    if (action === "send-link") {
      const { email, centerSlug } = params;

      if (!email || !centerSlug) {
        return new Response(
          JSON.stringify({ error: "Email y centro son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center by slug
      const { data: center, error: centerError } = await supabase
        .from("centers")
        .select("id, name, portal_enabled")
        .eq("portal_slug", centerSlug)
        .single();

      if (centerError || !center) {
        console.error("Center not found:", centerError);
        return new Response(
          JSON.stringify({ error: "Centro no encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!center.portal_enabled) {
        return new Response(
          JSON.stringify({ error: "El portal no está habilitado para este centro" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find patient by email in this center
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email")
        .eq("center_id", center.id)
        .eq("email", email.toLowerCase())
        .single();

      if (patientError || !patient) {
        // Don't reveal if patient exists or not for security
        console.log("Patient not found for email:", email);
        return new Response(
          JSON.stringify({ success: true, message: "Si existe una cuenta con este email, recibirás un enlace de acceso" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate secure token
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Create magic link
      const { error: linkError } = await supabase
        .from("patient_magic_links")
        .insert({
          patient_id: patient.id,
          email: email.toLowerCase(),
          center_id: center.id,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (linkError) {
        console.error("Error creating magic link:", linkError);
        return new Response(
          JSON.stringify({ error: "Error al crear el enlace" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send email with magic link
      const portalUrl = `${req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app")}/portal/${centerSlug}/dashboard?token=${token}`;

      // Log the URL for now - in production would send via Resend
      console.log("Magic link URL:", portalUrl);

      return new Response(
        JSON.stringify({ success: true, message: "Enlace enviado a tu email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      const { token } = params;

      if (!token) {
        return new Response(
          JSON.stringify({ error: "Token requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find and validate magic link
      const { data: magicLink, error: linkError } = await supabase
        .from("patient_magic_links")
        .select("*, patients(*), centers(name, portal_slug)")
        .eq("token", token)
        .single();

      if (linkError || !magicLink) {
        console.error("Magic link not found:", linkError);
        return new Response(
          JSON.stringify({ error: "Enlace inválido o expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check expiration
      if (new Date(magicLink.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "El enlace ha expirado. Solicita uno nuevo." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if already used
      if (magicLink.used_at) {
        // Allow reuse within 1 hour for convenience
        const usedAt = new Date(magicLink.used_at);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (usedAt < oneHourAgo) {
          return new Response(
            JSON.stringify({ error: "El enlace ya fue usado. Solicita uno nuevo." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Mark as used
        await supabase
          .from("patient_magic_links")
          .update({ used_at: new Date().toISOString() })
          .eq("id", magicLink.id);
      }

      // Generate session token (simple JWT-like for this use case)
      const sessionToken = btoa(JSON.stringify({
        patient_id: magicLink.patient_id,
        center_id: magicLink.center_id,
        exp: Date.now() + 60 * 60 * 1000, // 1 hour
      }));

      return new Response(
        JSON.stringify({
          success: true,
          sessionToken,
          patient: {
            id: magicLink.patients.id,
            firstName: magicLink.patients.first_name,
            lastName: magicLink.patients.last_name,
            email: magicLink.patients.email,
          },
          center: {
            name: magicLink.centers.name,
            slug: magicLink.centers.portal_slug,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "validate-session") {
      const { sessionToken } = params;

      if (!sessionToken) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const decoded = JSON.parse(atob(sessionToken));
        if (decoded.exp < Date.now()) {
          return new Response(
            JSON.stringify({ valid: false, error: "Sesión expirada" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get fresh patient data
        const { data: patient } = await supabase
          .from("patients")
          .select("id, first_name, last_name, email, center_id")
          .eq("id", decoded.patient_id)
          .single();

        const { data: center } = await supabase
          .from("centers")
          .select("name, portal_slug")
          .eq("id", decoded.center_id)
          .single();

        return new Response(
          JSON.stringify({
            valid: true,
            patient: patient ? {
              id: patient.id,
              firstName: patient.first_name,
              lastName: patient.last_name,
              email: patient.email,
            } : null,
            center: center ? {
              name: center.name,
              slug: center.portal_slug,
            } : null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in patient-portal-auth:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

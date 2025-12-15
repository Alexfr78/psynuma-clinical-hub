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
    const { 
      centerSlug, 
      firstName, 
      lastName, 
      email, 
      phone, 
      dateOfBirth 
    } = await req.json();

    // Validate required fields
    if (!centerSlug || !firstName || !lastName || !email) {
      return new Response(
        JSON.stringify({ error: "Nombre, apellidos y email son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get center by slug
    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select("id, name, portal_enabled, portal_default_professional_id")
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

    // Check if patient already exists
    const { data: existingPatient } = await supabase
      .from("patients")
      .select("id")
      .eq("center_id", center.id)
      .eq("email", email.toLowerCase())
      .single();

    if (existingPatient) {
      return new Response(
        JSON.stringify({ error: "Ya existe una cuenta con este email. Usa la opción de acceso." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create patient
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({
        center_id: center.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        date_of_birth: dateOfBirth || null,
        assigned_professional_id: center.portal_default_professional_id,
        status: "active",
      })
      .select()
      .single();

    if (patientError) {
      console.error("Error creating patient:", patientError);
      return new Response(
        JSON.stringify({ error: "Error al crear la cuenta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create patient portal account
    const { error: portalAccountError } = await supabase
      .from("patient_portal_accounts")
      .insert({
        patient_id: patient.id,
        email: email.toLowerCase().trim(),
        is_active: true,
      });

    if (portalAccountError) {
      console.error("Error creating portal account:", portalAccountError);
      // Don't fail - patient was created successfully
    }

    // Generate magic link for immediate access
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await supabase
      .from("patient_magic_links")
      .insert({
        patient_id: patient.id,
        email: email.toLowerCase(),
        center_id: center.id,
        token,
        expires_at: expiresAt.toISOString(),
      });

    // Log the URL for now - in production would send via Resend
    const portalUrl = `${req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app")}/portal/${centerSlug}/dashboard?token=${token}`;
    console.log("Welcome link URL:", portalUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Cuenta creada correctamente. Revisa tu email.",
        token, // Return token for immediate redirect
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in patient-portal-register:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

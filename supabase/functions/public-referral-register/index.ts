import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidEmail, isValidName } from "../_shared/validation.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limit
    const ip = getClientIp(req);
    const rl = await checkIpRateLimit(supabaseAdmin, ip, 'referral-register', 3, 60);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
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

    const body = await req.json();
    const {
      center_slug,
      name,
      surname,
      email,
      phone,
      website,
      description,
      public_name,
      modality,
      provinces,
      cities,
      specialties,
      privacy_accepted,
    } = body;

    // Validate required fields
    if (!center_slug || !name?.trim() || !email?.trim()) {
      return new Response(
        JSON.stringify({ error: "Nombre, email y slug del centro son obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isValidName(name, 150)) {
      return new Response(
        JSON.stringify({ error: "Nombre inválido (máximo 150 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!privacy_accepted) {
      return new Response(
        JSON.stringify({ error: "Debes aceptar la política de privacidad" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!modality || !Array.isArray(modality) || modality.length === 0) {
      return new Response(
        JSON.stringify({ error: "Debes seleccionar al menos una modalidad" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }




    // Resolve center_id from slug
    const { data: center, error: centerError } = await supabaseAdmin
      .from("centers")
      .select("id")
      .eq("portal_slug", center_slug)
      .maybeSingle();

    if (centerError || !center) {
      return new Response(
        JSON.stringify({ error: "Centro no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate email in pending requests
    const { data: existing } = await supabaseAdmin
      .from("referral_partner_requests")
      .select("id")
      .eq("center_id", center.id)
      .eq("email", email.trim())
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Ya existe una solicitud pendiente con este email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("referral_partner_requests")
      .insert({
        center_id: center.id,
        name: name.trim(),
        surname: surname?.trim() || null,
        email: email.trim(),
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        description: description?.trim() || null,
        public_name: public_name?.trim() || null,
        modality,
        provinces: provinces?.length ? provinces : null,
        cities: cities?.length ? cities : null,
        specialties: specialties?.length ? specialties : null,
        privacy_accepted: true,
        privacy_accepted_at: new Date().toISOString(),
        privacy_policy_url: "https://psicologosexual.com/politica-de-privacidad/",
        status: "pending",
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Error al enviar la solicitud" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Solicitud enviada correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

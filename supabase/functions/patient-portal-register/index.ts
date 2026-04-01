import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidEmail, isValidName } from "../_shared/validation.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

async function sendEmailViaResendAPI(
  to: string,
  subject: string,
  htmlContent: string,
  fromName: string
): Promise<{ success: boolean; error?: string }> {
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${(() => {
    const v = Deno.env.get('RESEND_FROM_EMAIL');
    if (!v) throw new Error('RESEND_FROM_EMAIL not configured');
    return v;
  })()}>`,
        to: [to],
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Resend API error:", data);
      return { success: false, error: data.message || "Email sending failed" };
    }

    const result = await response.json();
    console.log("Email sent successfully:", result);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

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

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isValidName(firstName) || !isValidName(lastName)) {
      return new Response(
        JSON.stringify({ error: "Nombre o apellido inválido (máximo 100 caracteres)" }),
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

    // Build portal URL
    const origin = req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app");
    const portalUrl = `${origin}/portal/${centerSlug}/dashboard?token=${token}`;

    // Send welcome email
    const welcomeEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">¡Bienvenido/a al Portal de Pacientes!</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
          <p style="font-size: 16px;">Hola <strong>${firstName}</strong>,</p>
          <p style="font-size: 16px;">Tu cuenta en <strong>${center.name}</strong> ha sido creada correctamente.</p>
          <p style="font-size: 16px;">Haz clic en el siguiente enlace para acceder por primera vez:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Acceder al Portal</a>
          </div>
          <p style="font-size: 14px; color: #64748b;">Este enlace es válido por <strong>15 minutos</strong>.</p>
          <p style="font-size: 14px; color: #64748b;">En el futuro, podrás solicitar un nuevo enlace de acceso desde la página del portal.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 14px; color: #64748b;">¡Gracias por confiar en nosotros!</p>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">${center.name}</p>
        </div>
      </body>
      </html>
    `;

    const emailResult = await sendEmailViaResendAPI(
      email.toLowerCase(),
      `Bienvenido/a a ${center.name}`,
      welcomeEmailHtml,
      center.name
    );

    if (!emailResult.success) {
      console.error("Failed to send welcome email:", emailResult.error);
      // Don't fail - registration was successful
    } else {
      console.log("Welcome email sent to:", email);
    }

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

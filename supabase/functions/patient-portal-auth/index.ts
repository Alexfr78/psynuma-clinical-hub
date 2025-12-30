import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

// Use SUPABASE_SERVICE_ROLE_KEY as HMAC secret for signing tokens
// This is secure because the service key is never exposed to clients
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// HMAC-SHA256 signing for secure tokens
async function signToken(payload: object): Promise<string> {
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

async function verifyToken(token: string): Promise<{ valid: boolean; payload?: { patient_id: string; center_id: string; exp: number } }> {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) {
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
      return { valid: false };
    }
    
    const payload = JSON.parse(data);
    
    // Check expiration
    if (payload.exp < Date.now()) {
      return { valid: false };
    }
    
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

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
        from: `${fromName} <onboarding@resend.dev>`,
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

      // Build portal URL
      const origin = req.headers.get("origin") || supabaseUrl.replace(".supabase.co", ".lovable.app");
      const portalUrl = `${origin}/portal/${centerSlug}/dashboard?token=${token}`;

      // Send email with magic link
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Acceso al Portal de Pacientes</h1>
          </div>
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="font-size: 16px;">Hola <strong>${patient.first_name}</strong>,</p>
            <p style="font-size: 16px;">Has solicitado acceso al portal de pacientes de <strong>${center.name}</strong>.</p>
            <p style="font-size: 16px;">Haz clic en el siguiente enlace para acceder:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Acceder al Portal</a>
            </div>
            <p style="font-size: 14px; color: #64748b;">Este enlace es válido por <strong>15 minutos</strong>.</p>
            <p style="font-size: 14px; color: #64748b;">Si no solicitaste este enlace, puedes ignorar este mensaje.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">${center.name}</p>
          </div>
        </body>
        </html>
      `;

      const emailResult = await sendEmailViaResendAPI(
        email.toLowerCase(),
        `Acceso al Portal - ${center.name}`,
        emailHtml,
        center.name
      );

      if (!emailResult.success) {
        console.error("Failed to send magic link email:", emailResult.error);
        // Still return success for security (don't reveal if patient exists)
      } else {
        console.log("Magic link email sent to:", email);
      }

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

      // Generate cryptographically signed session token
      const sessionToken = await signToken({
        patient_id: magicLink.patient_id,
        center_id: magicLink.center_id,
        exp: Date.now() + TOKEN_EXPIRY_MS,
      });

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

      const result = await verifyToken(sessionToken);
      
      if (!result.valid || !result.payload) {
        return new Response(
          JSON.stringify({ valid: false, error: "Sesión inválida o expirada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get fresh patient data
      const { data: patient } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email, center_id")
        .eq("id", result.payload.patient_id)
        .single();

      const { data: center } = await supabase
        .from("centers")
        .select("name, portal_slug")
        .eq("id", result.payload.center_id)
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

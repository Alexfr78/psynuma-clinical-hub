import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import { isValidEmail } from "../_shared/validation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tokenSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const wasenderPersonalToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");
const WASENDER_API_URL = "https://www.wasenderapi.com/api";

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const SESSION_EXPIRY_MS = 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MIN_RESPONSE_MS = 800;

type DeliveryChannel = "whatsapp" | "email";

interface PatientMatch {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface SessionTokenPayload {
  patient_id: string;
  center_id: string;
  exp: number;
  fp: string;
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^[67]\d{8}$/.test(digits)) digits = `34${digits}`;
  return digits;
}

function isValidPhone(phone: string): boolean {
  return /^\d{9,15}$/.test(normalizePhone(phone));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]!);
}

function generateOtp(): string {
  const upperBound = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= upperBound);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function importHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(tokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hashOtp(requestId: string, code: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(),
    new TextEncoder().encode(`${requestId}:${code}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifyOtpHash(
  requestId: string,
  code: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    const signature = Uint8Array.from(
      atob(encodedHash),
      (char) => char.charCodeAt(0),
    );
    return await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(),
      signature,
      new TextEncoder().encode(`${requestId}:${code}`),
    );
  } catch {
    return false;
  }
}

async function hashIdentifier(
  identifier: string,
  centerSlug: string,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${centerSlug}:${identifier.trim().toLowerCase()}`,
    ),
  );
  return Array.from(new Uint8Array(bytes))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function generateFingerprint(userAgent: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userAgent),
  );
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

async function signSessionToken(payload: SessionTokenPayload): Promise<string> {
  const data = JSON.stringify(payload);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(),
    new TextEncoder().encode(data),
  );
  return `${btoa(data)}.${
    btoa(String.fromCharCode(...new Uint8Array(signature)))
  }`;
}

async function sendEmailCode(
  to: string,
  code: string,
  centerName: string,
): Promise<boolean> {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) return false;

  try {
    const safeCenterName = escapeHtml(centerName);
    const safeFromName =
      centerName.replace(/[\r\n<>]/g, " ").trim().slice(0, 80) ||
      "Portal de pacientes";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${safeFromName} <${fromEmail}>`,
        to: [to],
        subject: `Código de acceso - ${centerName}`,
        html: `<!doctype html>
        <html lang="es">
          <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033;line-height:1.6;margin:0;padding:24px;background:#f6f8fb">
            <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e9f0;border-radius:12px;padding:32px">
              <h1 style="font-size:22px;margin:0 0 16px">Acceso al portal</h1>
              <p>Tu código de acceso a <strong>${safeCenterName}</strong> es:</p>
              <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:24px 0">${code}</p>
              <p>Caduca en 5 minutos y solo puede utilizarse una vez.</p>
              <p style="font-size:14px;color:#64748b">Si no solicitaste este código, puedes ignorar este mensaje.</p>
            </div>
          </body>
        </html>`,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error(
      "[patient-portal-otp] Email delivery failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
}

async function sendWhatsAppViaWasender(
  phone: string,
  message: string,
  wasenderToken: string,
  sessionApiKey?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${WASENDER_API_URL}/send-message`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionApiKey || wasenderToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: `+${normalizePhone(phone)}`,
          text: message,
        }),
      },
    );

    const responseText = await response.text();
    let result: { success?: boolean; message?: string; error?: string } | null =
      null;
    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch {
      // Wasender can occasionally return a non-JSON gateway response.
    }

    if (!response.ok || result?.success === false) {
      return {
        success: false,
        error: result?.message || result?.error ||
          `HTTP ${response.status}: ${responseText.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function sendWhatsAppCode(
  supabase: SupabaseClient,
  centerId: string,
  phone: string,
  code: string,
  centerName: string,
): Promise<boolean> {
  if (!wasenderPersonalToken) {
    console.error(
      "[patient-portal-otp] WASENDER_PERSONAL_ACCESS_TOKEN is not configured",
    );
    return false;
  }

  const { data: whatsappSession, error: sessionError } = await supabase
    .from("whatsapp_sessions")
    .select("wasender_session_id, status, api_key")
    .eq("center_id", centerId)
    .maybeSingle();

  if (sessionError) {
    console.error(
      "[patient-portal-otp] Could not load WhatsApp session",
      sessionError.message,
    );
    return false;
  }
  if (
    !whatsappSession?.wasender_session_id ||
    whatsappSession.status !== "connected"
  ) {
    console.error(
      "[patient-portal-otp] WhatsApp session is not connected for center",
      centerId,
    );
    return false;
  }

  const message =
    `${centerName}: tu código de acceso es ${code}. Caduca en 5 minutos. No lo compartas con nadie.`;
  let result = await sendWhatsAppViaWasender(
    phone,
    message,
    wasenderPersonalToken,
    whatsappSession.api_key || undefined,
  );

  if (!result.success) {
    console.warn(
      `[patient-portal-otp] Wasender attempt 1 failed: ${result.error}. Retrying in 3s`,
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    result = await sendWhatsAppViaWasender(
      phone,
      message,
      wasenderPersonalToken,
      whatsappSession.api_key || undefined,
    );
  }

  if (!result.success) {
    console.error(
      "[patient-portal-otp] Wasender delivery failed definitively",
      result.error,
    );
  }
  return result.success;
}

async function ensureRateLimit(
  supabase: SupabaseClient,
  req: Request,
  action: string,
  identifierKey?: string,
) {
  const ipResult = await checkIpRateLimit(
    supabase,
    getClientIp(req),
    action,
    5,
    15,
  );
  if (!ipResult.allowed) return ipResult;
  if (!identifierKey) return ipResult;
  return checkIpRateLimit(
    supabase,
    `identifier:${identifierKey}`,
    `${action}-identifier`,
    5,
    15,
  );
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, ...params } = await req.json();

    if (action === "request-code") {
      const startedAt = Date.now();
      const centerSlug = typeof params.centerSlug === "string"
        ? params.centerSlug.trim()
        : "";
      const identifier = typeof params.identifier === "string"
        ? params.identifier.trim()
        : "";
      const channel: DeliveryChannel = params.channel === "email"
        ? "email"
        : "whatsapp";

      if (!centerSlug || !identifier) {
        return jsonResponse(
          { error: "Datos de acceso incompletos" },
          400,
          corsHeaders,
        );
      }
      if (
        channel === "email"
          ? !isValidEmail(identifier)
          : !isValidPhone(identifier)
      ) {
        return jsonResponse(
          {
            error: channel === "email"
              ? "Introduce un correo válido"
              : "Introduce un teléfono válido",
          },
          400,
          corsHeaders,
        );
      }

      const identifierKey = await hashIdentifier(identifier, centerSlug);
      const rateLimit = await ensureRateLimit(
        supabase,
        req,
        "portal-otp-request",
        identifierKey,
      );
      if (!rateLimit.allowed) {
        return jsonResponse(
          {
            error:
              "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
          },
          429,
          {
            ...corsHeaders,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        );
      }

      if (Math.random() < 0.05) {
        await supabase
          .from("patient_portal_otp_codes")
          .delete()
          .lt(
            "expires_at",
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          );
      }

      const { data: center } = await supabase
        .from("centers")
        .select("id, name, portal_enabled")
        .eq("portal_slug", centerSlug)
        .maybeSingle();

      if (!center?.portal_enabled) {
        return jsonResponse(
          { error: "Portal no disponible" },
          404,
          corsHeaders,
        );
      }

      const requestId = crypto.randomUUID();
      const { data: matches, error: matchError } = await supabase.rpc(
        "find_portal_patient_by_identifier",
        {
          p_center_id: center.id,
          p_identifier: identifier,
          p_channel: channel,
        },
      );

      if (matchError) {
        console.error(
          "[patient-portal-otp] Patient lookup failed",
          matchError.message,
        );
      }
      const patients = (matches || []) as PatientMatch[];
      console.log(
        `[patient-portal-otp] Lookup completed for channel ${channel}: ${patients.length} match(es)`,
      );

      if (!matchError && patients.length >= 1) {
        // Con duplicados (mismo teléfono/email) la RPC devuelve el candidato
        // más relevante primero: activo y con actividad más reciente.
        const patient = patients.find((candidate) =>
          channel === "email" ? !!candidate.email : !!candidate.phone
        ) ?? patients[0];
        const code = generateOtp();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

        await supabase
          .from("patient_portal_otp_codes")
          .update({ used_at: now.toISOString() })
          .eq("patient_id", patient.id)
          .eq("center_id", center.id)
          .is("used_at", null);

        const { error: insertError } = await supabase
          .from("patient_portal_otp_codes")
          .insert({
            id: requestId,
            patient_id: patient.id,
            center_id: center.id,
            code_hash: await hashOtp(requestId, code),
            channel,
            expires_at: expiresAt.toISOString(),
          });

        if (!insertError) {
          if (channel === "email") {
            if (patient.email) {
              await sendEmailCode(patient.email, code, center.name);
            }
          } else if (patient.phone) {
            const sentByWhatsApp = await sendWhatsAppCode(
              supabase,
              center.id,
              patient.phone,
              code,
              center.name,
            );
            console.log(
              `[patient-portal-otp] WhatsApp delivery ${
                sentByWhatsApp ? "succeeded" : "failed"
              }`,
            );
            if (!sentByWhatsApp && patient.email) {
              const sentByEmail = await sendEmailCode(
                patient.email,
                code,
                center.name,
              );
              if (sentByEmail) {
                console.log(
                  "[patient-portal-otp] Email fallback delivery succeeded",
                );
                await supabase
                  .from("patient_portal_otp_codes")
                  .update({ channel: "email" })
                  .eq("id", requestId);
              } else {
                console.error(
                  "[patient-portal-otp] Email fallback delivery failed",
                );
              }
            }
          }
        } else {
          console.error(
            "[patient-portal-otp] Could not persist OTP",
            insertError.message,
          );
        }
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_RESPONSE_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_RESPONSE_MS - elapsed)
        );
      }

      return jsonResponse(
        {
          success: true,
          requestId,
          expiresInSeconds: OTP_EXPIRY_MS / 1000,
          resendAfterSeconds: 60,
          message: "Si los datos coinciden, recibirás un código de acceso.",
        },
        200,
        corsHeaders,
      );
    }

    if (action === "verify-code") {
      const requestId = typeof params.requestId === "string"
        ? params.requestId
        : "";
      const code = typeof params.code === "string"
        ? params.code.replace(/\D/g, "")
        : "";
      if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^\d{6}$/.test(code)) {
        return jsonResponse(
          { error: "Código incorrecto o caducado" },
          401,
          corsHeaders,
        );
      }

      const rateLimit = await ensureRateLimit(
        supabase,
        req,
        "portal-otp-verify",
      );
      if (!rateLimit.allowed) {
        return jsonResponse(
          {
            error:
              "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
          },
          429,
          {
            ...corsHeaders,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        );
      }

      const { data: otp } = await supabase
        .from("patient_portal_otp_codes")
        .select(
          "id, patient_id, center_id, code_hash, expires_at, used_at, failed_attempts",
        )
        .eq("id", requestId)
        .maybeSingle();

      const invalid = !otp ||
        Boolean(otp.used_at) ||
        new Date(otp.expires_at).getTime() < Date.now() ||
        otp.failed_attempts >= MAX_CODE_ATTEMPTS;

      if (invalid || !await verifyOtpHash(requestId, code, otp.code_hash)) {
        if (otp && !otp.used_at && otp.failed_attempts < MAX_CODE_ATTEMPTS) {
          await supabase
            .from("patient_portal_otp_codes")
            .update({ failed_attempts: otp.failed_attempts + 1 })
            .eq("id", requestId);
        }
        return jsonResponse(
          { error: "Código incorrecto o caducado" },
          401,
          corsHeaders,
        );
      }

      const { data: consumed } = await supabase
        .from("patient_portal_otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", requestId)
        .is("used_at", null)
        .select("id")
        .maybeSingle();

      if (!consumed) {
        return jsonResponse(
          { error: "Código incorrecto o caducado" },
          401,
          corsHeaders,
        );
      }

      const [{ data: patient }, { data: center }] = await Promise.all([
        supabase
          .from("patients")
          .select("id, first_name, last_name, email")
          .eq("id", otp.patient_id)
          .maybeSingle(),
        supabase
          .from("centers")
          .select("id, name, portal_slug, portal_enabled")
          .eq("id", otp.center_id)
          .maybeSingle(),
      ]);

      if (!patient || !center?.portal_enabled) {
        return jsonResponse(
          { error: "No se ha podido iniciar la sesión" },
          401,
          corsHeaders,
        );
      }

      const fingerprint = await generateFingerprint(
        req.headers.get("user-agent") || "",
      );
      const sessionToken = await signSessionToken({
        patient_id: patient.id,
        center_id: center.id,
        exp: Date.now() + SESSION_EXPIRY_MS,
        fp: fingerprint,
      });

      await supabase
        .from("patient_portal_otp_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("patient_id", patient.id)
        .eq("center_id", center.id)
        .is("used_at", null);

      return jsonResponse(
        {
          success: true,
          sessionToken,
          patient: {
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            email: patient.email,
          },
          center: { name: center.name, slug: center.portal_slug },
        },
        200,
        corsHeaders,
      );
    }

    return jsonResponse({ error: "Acción no válida" }, 400, corsHeaders);
  } catch (error) {
    console.error(
      "[patient-portal-otp] Unhandled error",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonResponse(
      { error: "Error interno del servidor" },
      500,
      getCorsHeaders(req),
    );
  }
});

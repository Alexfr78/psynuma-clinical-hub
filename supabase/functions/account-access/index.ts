// Alta de profesionales y acceso de pacientes desde /auth.
//
// Las respuestas de "register" y "patient-access" son siempre iguales, con un
// tiempo mínimo: lo que cambia es el email que recibe el titular. Así la pantalla
// no revela si un email es de un paciente (dato de salud) ni si ya tiene cuenta.
// La cuenta de profesional solo se crea en "complete", con el enlace del email.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import { isValidEmail } from "../_shared/validation.ts";

const SIGNUP_EXPIRY_MS = 24 * 60 * 60 * 1000;
const NEUTRAL_RESPONSE_MS = 700;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
// Como mucho 3 emails de este flujo por dirección y hora, pase lo que pase con la IP.
const MAX_EMAILS_PER_ADDRESS = 3;
const EMAIL_WINDOW_MINUTES = 60;
const NAME_PATTERN = /^[\p{L}][\p{L} '.-]{0,49}$/u;

interface PatientCenter {
  center_id: string;
  center_name: string;
  portal_slug: string | null;
  portal_enabled: boolean;
}

class LookupError extends Error {}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!
  );
}

function appBaseUrl(): string {
  return (Deno.env.get("APP_BASE_URL") || "https://psycma.lovable.app").replace(/\/+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "register" y "patient-access" responden tras un tiempo fijo con algo de ruido,
// sin esperar a las consultas ni al email, que van en segundo plano.
async function neutralDelay(startedAt: number) {
  const target = NEUTRAL_RESPONSE_MS + Math.floor(Math.random() * 300);
  const elapsed = Date.now() - startedAt;
  if (elapsed < target) await new Promise((resolve) => setTimeout(resolve, target - elapsed));
}

function runInBackground(task: Promise<unknown>) {
  const guarded = task.catch((error) =>
    console.error("[account-access] Background task failed", error instanceof Error ? error.message : "unknown")
  );
  const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(guarded);
}

async function emailQuotaAvailable(supabase: SupabaseClient, email: string): Promise<boolean> {
  const rate = await checkIpRateLimit(
    supabase,
    `email:${await sha256Hex(email)}`,
    "account-access-mail",
    MAX_EMAILS_PER_ADDRESS,
    EMAIL_WINDOW_MINUTES,
  );
  return rate.allowed;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172033;line-height:1.6;margin:0;padding:24px;background:#f6f8fb">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e9f0;border-radius:12px;padding:32px">
      <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
      ${body}
      <p style="font-size:14px;color:#64748b;margin-top:24px">Si no has sido tú, puedes ignorar este mensaje.</p>
    </div>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(label)}</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    console.error("[account-access] Resend is not configured");
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Psycma <${from}>`, to: [to], subject, html }),
    });
    if (!response.ok) console.error("[account-access] Resend responded", response.status);
    return response.ok;
  } catch (error) {
    console.error("[account-access] Email delivery failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

async function findPatientCenters(supabase: SupabaseClient, email: string): Promise<PatientCenter[]> {
  const { data, error } = await supabase.rpc("find_patient_centers_by_email", { p_email: email });
  if (error) {
    console.error("[account-access] Patient lookup failed", error.message);
    throw new LookupError("patient lookup failed");
  }
  return (data || []) as PatientCenter[];
}

async function sendPatientAccessEmail(email: string, centers: PatientCenter[]) {
  const base = appBaseUrl();
  const blocks = centers.map((center) => {
    const name = escapeHtml(center.center_name);
    if (center.portal_enabled && center.portal_slug) {
      return `<p>Para ver tus citas, documentos y facturas de <strong>${name}</strong>, entra en tu área de paciente. Te pediremos un código que te llegará al momento.</p>${
        button(`${base}/portal/${encodeURIComponent(center.portal_slug)}`, `Entrar en mi área de paciente`)
      }`;
    }
    return `<p><strong>${name}</strong> todavía no tiene activa el área de paciente. Puedes gestionar cada cita desde el enlace que te llega en los recordatorios, o escribir a tu profesional.</p>`;
  }).join("");

  await sendEmail(
    email,
    "Acceso a tu área de paciente",
    layout(
      "Tu acceso como paciente",
      `<p>Hola,</p>
       <p>Hemos recibido una solicitud de acceso con este email. Las cuentas de Psycma con contraseña son para profesionales; como paciente no necesitas crear ninguna.</p>
       ${blocks}`,
    ),
  );
}

type HandlerResult = { status: number; body: Record<string, unknown> };
const NEUTRAL_OK: HandlerResult = { status: 200, body: { success: true } };

// Solo valida el formato (no depende de quién es el email) y deja el resto en
// segundo plano. La respuesta es la misma en todos los casos.
function handleRegister(supabase: SupabaseClient, params: Record<string, unknown>): HandlerResult {
  const email = String(params.email ?? "").trim().toLowerCase();
  const firstName = String(params.firstName ?? "").trim();
  const lastName = String(params.lastName ?? "").trim();
  if (!isValidEmail(email) || !NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) {
    return { status: 400, body: { error: "Revisa el nombre, los apellidos y el email." } };
  }
  runInBackground(processRegister(supabase, email, firstName, lastName));
  return NEUTRAL_OK;
}

async function processRegister(supabase: SupabaseClient, email: string, firstName: string, lastName: string) {
  if (!(await emailQuotaAvailable(supabase, email))) return;

  const patientCenters = await findPatientCenters(supabase, email);
  if (patientCenters.length > 0) {
    await sendPatientAccessEmail(email, patientCenters);
    return;
  }

  const { data: exists, error: existsError } = await supabase.rpc("auth_email_exists", { p_email: email });
  if (existsError) throw new LookupError(`account lookup failed: ${existsError.message}`);
  if (exists) {
    await sendEmail(
      email,
      "Ya tienes una cuenta en Psycma",
      layout(
        "Ya tienes una cuenta",
        `<p>Alguien ha intentado registrarse en Psycma con este email, pero ya tienes una cuenta.</p>
         <p>Inicia sesión con tu contraseña. Si no la recuerdas, usa «¿Has olvidado tu contraseña?» en la pantalla de acceso.</p>
         ${button(`${appBaseUrl()}/auth`, "Iniciar sesión")}`,
      ),
    );
    return;
  }

  // Un enlace nuevo anula los anteriores para el mismo email.
  const now = new Date().toISOString();
  await supabase.from("pending_signups").update({ used_at: now }).eq("email", email).is("used_at", null);

  const token = randomToken();
  const { error: insertError } = await supabase.from("pending_signups").insert({
    email,
    first_name: firstName,
    last_name: lastName,
    token_hash: await sha256Hex(token),
    expires_at: new Date(Date.now() + SIGNUP_EXPIRY_MS).toISOString(),
  });
  if (insertError) throw new Error(`could not store pending signup: ${insertError.message}`);

  await sendEmail(
    email,
    "Completa tu alta en Psycma",
    layout(
      "Completa tu alta",
      `<p>Para terminar de crear tu cuenta de profesional en Psycma, elige tu contraseña desde este enlace. Caduca en 24 horas.</p>
       ${button(`${appBaseUrl()}/auth/completar/${token}`, "Crear mi contraseña")}`,
    ),
  );
}

function handlePatientAccess(supabase: SupabaseClient, params: Record<string, unknown>): HandlerResult {
  const email = String(params.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: 400, body: { error: "Introduce un email válido." } };
  }
  runInBackground((async () => {
    if (!(await emailQuotaAvailable(supabase, email))) return;
    const centers = await findPatientCenters(supabase, email);
    if (centers.length > 0) await sendPatientAccessEmail(email, centers);
  })());
  return NEUTRAL_OK;
}

async function loadPendingSignup(supabase: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await supabase
    .from("pending_signups")
    .select("id, email, first_name, last_name, expires_at, used_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}

async function handlePeek(supabase: SupabaseClient, params: Record<string, unknown>) {
  const pending = await loadPendingSignup(supabase, params.token);
  if (!pending) return { status: 404, body: { error: "El enlace no es válido o ha caducado." } };
  return {
    status: 200,
    body: { email: pending.email, firstName: pending.first_name, lastName: pending.last_name },
  };
}

async function handleComplete(supabase: SupabaseClient, params: Record<string, unknown>) {
  const password = typeof params.password === "string" ? params.password : "";
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return {
      status: 400,
      body: { error: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.` },
    };
  }

  const pending = await loadPendingSignup(supabase, params.token);
  if (!pending) return { status: 404, body: { error: "El enlace no es válido o ha caducado." } };

  // Pudo darse de alta como paciente mientras tanto. Si la consulta falla, no se
  // crea la cuenta (mejor reintentar que dar cuenta de profesional a un paciente).
  let patientCenters: PatientCenter[];
  try {
    patientCenters = await findPatientCenters(supabase, pending.email);
  } catch {
    return { status: 503, body: { error: "No se pudo completar el alta ahora mismo. Inténtalo en unos minutos." } };
  }
  if (patientCenters.length > 0) {
    await supabase.from("pending_signups").update({ used_at: new Date().toISOString() }).eq("id", pending.id);
    return { status: 409, body: { error: "Este email está registrado como paciente. Revisa tu correo para entrar en tu área de paciente." } };
  }

  // Marcar primero evita que dos clics simultáneos creen dos cuentas.
  const { data: claimed } = await supabase
    .from("pending_signups")
    .update({ used_at: new Date().toISOString() })
    .eq("id", pending.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { status: 404, body: { error: "El enlace no es válido o ha caducado." } };

  const { error: createError } = await supabase.auth.admin.createUser({
    email: pending.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: pending.first_name, last_name: pending.last_name },
  });
  if (createError) {
    const alreadyExists = /already/i.test(createError.message);
    console.error("[account-access] createUser failed", createError.message);
    if (!alreadyExists) {
      await supabase.from("pending_signups").update({ used_at: null }).eq("id", pending.id);
    }
    return {
      status: alreadyExists ? 409 : 500,
      body: {
        error: alreadyExists
          ? "Ya existe una cuenta con este email. Inicia sesión."
          : "No se pudo crear la cuenta. Inténtalo de nuevo.",
      },
    };
  }

  return { status: 200, body: { success: true, email: pending.email } };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);

  const startedAt = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { action, ...params } = await req.json();

    const limits: Record<string, [number, number]> = {
      register: [5, 15],
      "patient-access": [5, 15],
      peek: [30, 15],
      complete: [10, 15],
    };
    const limit = limits[action];
    if (!limit) return json({ error: "Acción no válida" }, 400, cors);

    const rate = await checkIpRateLimit(supabase, getClientIp(req), `account-access-${action}`, limit[0], limit[1]);
    if (!rate.allowed) {
      return json(
        { error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo." },
        429,
        { ...cors, "Retry-After": String(rate.retryAfterSeconds) },
      );
    }

    if (action === "register" || action === "patient-access") {
      const result = action === "register"
        ? handleRegister(supabase, params)
        : handlePatientAccess(supabase, params);
      await neutralDelay(startedAt);
      return json(result.body, result.status, cors);
    }

    const result = action === "peek"
      ? await handlePeek(supabase, params)
      : await handleComplete(supabase, params);
    return json(result.body, result.status, cors);
  } catch (error) {
    console.error("[account-access] Unexpected error", error instanceof Error ? error.message : "unknown");
    await neutralDelay(startedAt);
    return json({ error: "No se pudo completar la solicitud." }, 500, cors);
  }
});

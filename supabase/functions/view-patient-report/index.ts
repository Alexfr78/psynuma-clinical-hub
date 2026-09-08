import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAuditEvent } from "../_shared/auditLogger.ts";

// Único punto de lectura pública del informe enviado a un paciente
// (`/informe/:token`). Deliberadamente NO hay política RLS "por token" sobre
// `patient_report_links` — a diferencia de invoices/consents/sessions, que sí
// exponen una policy `USING` para anon vía un `get_*_token()` — porque esta
// función necesita registrar cada acceso (con IP) en el mismo golpe en el
// que lo sirve, y eso solo se puede hacer aquí, con el service role.
//
// El registro de acceso reutiliza `record_audit_event` / `logAuditEvent`
// (resourceType 'reports', acción 'VIEW'), el mismo mecanismo que ya usa
// `send-notification` para las entregas de estos informes — no una tabla de
// log nueva sin ninguna pantalla para consultarla. Así "quién accedió y
// cuándo" queda visible ya hoy en /auditoria-clinica, filtrable por paciente
// e IP.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-report-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PatientReportLinkRow {
  id: string;
  center_id: string;
  patient_id: string;
  session_id: string | null;
  title: string;
  content_markdown: string;
  expires_at: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = req.headers.get("x-report-token");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "No se proporcionó ningún token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: link, error: linkError } = await supabase
      .from("patient_report_links")
      .select("id, center_id, patient_id, session_id, title, content_markdown, expires_at, created_at")
      .eq("access_token", token)
      .maybeSingle();

    if (linkError || !link) {
      return new Response(
        JSON.stringify({ error: "El enlace no es válido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const row = link as PatientReportLinkRow;
    const isExpired = new Date(row.expires_at) < new Date();

    const [{ data: patient }, { data: center }] = await Promise.all([
      supabase.from("patients").select("first_name").eq("id", row.patient_id).maybeSingle(),
      supabase.from("centers").select("name, logo_url, invoice_logo_url").eq("id", row.center_id).maybeSingle(),
    ]);

    // Registrar el acceso siempre — incluido cuando el enlace ya ha caducado
    // — porque es la prueba de entrega que protege al profesional ante una
    // reclamación. logAuditEvent nunca lanza (falla en silencio hacia
    // consola) para no bloquear la respuesta al paciente.
    await logAuditEvent({
      supabase,
      req,
      userId: null,
      organizationId: row.center_id,
      patientId: row.patient_id,
      resourceType: "reports",
      resourceId: row.id,
      action: "VIEW",
      status: isExpired ? "denied" : "success",
      routeOrEndpoint: "view-patient-report",
      metadata: { sessionId: row.session_id ?? null, expired: isExpired },
    });

    return new Response(
      JSON.stringify({
        expired: isExpired,
        title: row.title,
        contentMarkdown: isExpired ? null : row.content_markdown,
        patientFirstName: patient?.first_name ?? null,
        centerName: center?.name ?? null,
        centerLogoUrl: center?.invoice_logo_url || center?.logo_url || null,
        generatedAt: row.created_at,
        expiresAt: row.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[view-patient-report] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

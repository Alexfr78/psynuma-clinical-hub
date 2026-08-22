import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tokenSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function validateSession(sessionToken: string): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) return { valid: false };
    const data = atob(payloadB64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(tokenSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(atob(signatureB64), (character) => character.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));
    if (!valid) return { valid: false };
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return { valid: false };
    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch {
    return { valid: false };
  }
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isExpired(expiresAt: string | null | undefined) {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now();
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, sessionToken } = await req.json();
    const session = await validateSession(sessionToken);
    if (!session.valid || !session.patientId || !session.centerId) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action !== "list") {
      return new Response(JSON.stringify({ error: "Acción no válida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const [consentsResult, assessmentsResult, autoregistrosResult] = await Promise.all([
      supabase
        .from("consents")
        .select("id, status, created_at, expires_at, signed_at, access_token, template:consent_templates(name)")
        .eq("patient_id", session.patientId)
        .eq("center_id", session.centerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("assessments")
        .select("id, status, created_at, expires_at, completed_at, access_token, template:assessment_templates(name)")
        .eq("patient_id", session.patientId)
        .eq("center_id", session.centerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("autoregistro_links")
        .select("id, status, created_at, expires_at, allow_multiple, access_token, template:autoregistro_templates(name), entries:autoregistro_entries(id, submitted_at)")
        .eq("patient_id", session.patientId)
        .eq("center_id", session.centerId)
        .order("created_at", { ascending: false }),
    ]);

    const failed = [consentsResult, assessmentsResult, autoregistrosResult].find((result) => result.error);
    if (failed?.error) throw failed.error;

    const consents = (consentsResult.data || []).map((consent) => {
      const template = firstRelation(consent.template);
      const status = consent.status === "pending" && isExpired(consent.expires_at) ? "expired" : consent.status || "pending";
      return {
        id: consent.id,
        type: "consent",
        title: template?.name || "Consentimiento informado",
        status,
        createdAt: consent.created_at,
        expiresAt: consent.expires_at,
        completedAt: consent.signed_at,
        actionPath: ["pending", "signed"].includes(status) ? `/consentimiento/${consent.access_token}` : null,
      };
    });

    const assessments = (assessmentsResult.data || []).map((assessment) => {
      const template = firstRelation(assessment.template);
      const status = assessment.status === "pending" && isExpired(assessment.expires_at) ? "expired" : assessment.status;
      return {
        id: assessment.id,
        type: "assessment",
        title: template?.name || "Evaluación",
        status,
        createdAt: assessment.created_at,
        expiresAt: assessment.expires_at,
        completedAt: assessment.completed_at,
        actionPath: status === "pending" ? `/evaluacion/${assessment.access_token}` : null,
      };
    });

    const autoregistros = (autoregistrosResult.data || []).map((link) => {
      const template = firstRelation(link.template);
      const entries = link.entries || [];
      const expired = isExpired(link.expires_at);
      const active = link.status === "active" && !expired;
      const status = expired ? "expired" : active ? (entries.length > 0 ? "in_progress" : "pending") : "completed";
      const latestEntry = [...entries]
        .filter((entry) => entry.submitted_at)
        .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))[0];
      return {
        id: link.id,
        type: "autoregistro",
        title: template?.name || "Autorregistro",
        status,
        createdAt: link.created_at,
        expiresAt: link.expires_at,
        completedAt: latestEntry?.submitted_at || null,
        actionPath: active ? `/registro/${link.access_token}` : null,
        submissionCount: entries.length,
        allowMultiple: !!link.allow_multiple,
      };
    });

    const documents = [...consents, ...assessments, ...autoregistros]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    logAuditEvent({
      supabase, req,
      userId: null, userRole: "patient",
      organizationId: session.centerId,
      patientId: session.patientId,
      resourceType: "patient_documents", action: "VIEW",
      routeOrEndpoint: "patient-portal-documents/list",
    });

    return new Response(JSON.stringify({ documents }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Patient portal documents error:", error);
    return new Response(JSON.stringify({ error: "Error al obtener los documentos" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

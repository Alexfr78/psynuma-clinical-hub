import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function validateSession(sessionToken: string): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) return { valid: false };

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

    if (!isValid) return { valid: false };

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return { valid: false };

    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch {
    return { valid: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, sessionToken, ...params } = await req.json();

    const session = await validateSession(sessionToken);
    if (!session.valid || !session.patientId) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, issue_date, subtotal, tax_rate, tax_amount, total, status, is_recapitulative, is_valid, access_token, retention_rate, retention_amount")
        .eq("patient_id", session.patientId)
        .eq("center_id", session.centerId)
        .neq("status", "draft")
        .order("issue_date", { ascending: false });

      if (error) {
        console.error("Error fetching invoices:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener las facturas" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Filter out invalidated invoices and strip access_token for security (only expose view URL)
      const filtered = (invoices || []).map(inv => ({
        ...inv,
        access_token: inv.access_token || undefined,
      }));

      // Audit: patient viewed their invoices
      logAuditEvent({
        supabase, req,
        userId: null, userRole: 'patient',
        organizationId: session.centerId,
        patientId: session.patientId,
        resourceType: 'invoices', action: 'VIEW',
        routeOrEndpoint: 'patient-portal-invoices/list',
      });

      return new Response(
        JSON.stringify({ invoices: filtered }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "finance-summary") {
      const [debtsResult, bonosResult, paymentsResult] = await Promise.all([
        supabase
          .from("debts")
          .select(`
            id, amount, paid_amount, due_date, status, access_token,
            session:sessions(session_date, session_type),
            bono:bonos(name)
          `)
          .eq("patient_id", session.patientId)
          .eq("center_id", session.centerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("bonos")
          .select("id, name, total_sessions, used_sessions, total_price, status, expires_at")
          .eq("patient_id", session.patientId)
          .eq("center_id", session.centerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select(`
            id, amount, payment_date, payment_method, status, refunded_amount,
            invoice:invoices(invoice_number),
            session:sessions(session_date, session_type)
          `)
          .eq("patient_id", session.patientId)
          .eq("center_id", session.centerId)
          .order("payment_date", { ascending: false })
          .limit(50),
      ]);

      const failed = [debtsResult, bonosResult, paymentsResult].find((result) => result.error);
      if (failed?.error) {
        console.error("Error fetching patient finance summary:", failed.error);
        return new Response(
          JSON.stringify({ error: "Error al obtener los pagos y bonos" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const debts = (debtsResult.data || []).map((debt) => {
        const pendingAmount = Math.max(0, Number(debt.amount || 0) - Number(debt.paid_amount || 0));
        const relatedSession = firstRelation(debt.session);
        const relatedBono = firstRelation(debt.bono);
        return {
          id: debt.id,
          amount: Number(debt.amount || 0),
          paidAmount: Number(debt.paid_amount || 0),
          pendingAmount,
          dueDate: debt.due_date,
          status: debt.status,
          concept: relatedSession?.session_type
            ? `${relatedSession.session_type}${relatedSession.session_date ? ` - ${relatedSession.session_date}` : ""}`
            : relatedBono?.name || "Importe pendiente",
          paymentPath: pendingAmount > 0 && debt.access_token ? `/pagar/${debt.access_token}` : null,
        };
      });

      const bonos = (bonosResult.data || []).map((bono) => ({
        id: bono.id,
        name: bono.name,
        totalSessions: Number(bono.total_sessions || 0),
        usedSessions: Number(bono.used_sessions || 0),
        remainingSessions: Math.max(0, Number(bono.total_sessions || 0) - Number(bono.used_sessions || 0)),
        totalPrice: Number(bono.total_price || 0),
        status: bono.status,
        expiresAt: bono.expires_at,
      }));

      const payments = (paymentsResult.data || []).map((payment) => {
        const relatedInvoice = firstRelation(payment.invoice);
        const relatedSession = firstRelation(payment.session);
        return {
          id: payment.id,
          amount: Number(payment.amount || 0),
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          status: payment.status,
          refundedAmount: Number(payment.refunded_amount || 0),
          concept: relatedInvoice?.invoice_number
            ? `Factura ${relatedInvoice.invoice_number}`
            : relatedSession?.session_type
              ? `${relatedSession.session_type}${relatedSession.session_date ? ` - ${relatedSession.session_date}` : ""}`
              : "Pago",
        };
      });

      logAuditEvent({
        supabase, req,
        userId: null, userRole: "patient",
        organizationId: session.centerId,
        patientId: session.patientId,
        resourceType: "patient_finance", action: "VIEW",
        routeOrEndpoint: "patient-portal-invoices/finance-summary",
      });

      return new Response(
        JSON.stringify({ debts, bonos, payments }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "download") {
      const { invoiceId } = params;

      if (!invoiceId) {
        return new Response(
          JSON.stringify({ error: "ID de factura requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify invoice belongs to this patient
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .select("id, patient_id, center_id, status")
        .eq("id", invoiceId)
        .eq("patient_id", session.patientId)
        .eq("center_id", session.centerId)
        .neq("status", "draft")
        .single();

      if (invError || !invoice) {
        return new Response(
          JSON.stringify({ error: "Factura no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Invoke generate-invoice-pdf internally
      const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/generate-invoice-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ invoiceId }),
      });

      if (!pdfResponse.ok) {
        console.error("PDF generation failed:", await pdfResponse.text());
        return new Response(
          JSON.stringify({ error: "Error al generar el PDF" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pdfData = await pdfResponse.json();

      return new Response(
        JSON.stringify({ success: true, pdf: pdfData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

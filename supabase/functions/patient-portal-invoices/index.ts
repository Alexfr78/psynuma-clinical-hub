import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

      return new Response(
        JSON.stringify({ invoices: filtered }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

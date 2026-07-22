import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { authorizeFiscalInvoiceRequest } from "../_shared/fiscalAuth.ts";

type OperationType = "rectificativa_substitution" | "f3_replacement";

type RequestBody = {
  original_invoice_id?: string;
  operation_type?: OperationType;
  series_id?: string;
  recipient?: Record<string, unknown>;
  update_patient?: boolean;
  idempotency_key?: string;
};

function jsonResponse(
  status: number,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(405, corsHeaders, { error: "Metodo no permitido" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let operationId: string | null = null;

  try {
    const body = await req.json() as RequestBody;
    const {
      original_invoice_id: originalInvoiceId,
      operation_type: operationType,
      series_id: seriesId,
      recipient = {},
      update_patient: updatePatient = true,
      idempotency_key: idempotencyKey,
    } = body;

    if (!originalInvoiceId || !seriesId || !idempotencyKey) {
      return jsonResponse(422, corsHeaders, {
        error: "original_invoice_id, series_id e idempotency_key son obligatorios",
        code: "validation_error",
      });
    }

    if (!operationType || !["rectificativa_substitution", "f3_replacement"].includes(operationType)) {
      return jsonResponse(422, corsHeaders, {
        error: "operation_type no valido",
        code: "validation_error",
      });
    }

    const { data: originalInvoice, error: invoiceError } = await serviceClient
      .from("invoices")
      .select("id, center_id")
      .eq("id", originalInvoiceId)
      .maybeSingle();

    if (invoiceError || !originalInvoice) {
      return jsonResponse(404, corsHeaders, { error: "Factura no encontrada" });
    }

    const access = await authorizeFiscalInvoiceRequest(req, serviceClient, {
      invoiceId: originalInvoiceId,
      invoiceCenterId: originalInvoice.center_id,
      allowedRoles: ["admin"],
      corsHeaders,
    });
    if (!access.ok) return access.response;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rpcName = operationType === "rectificativa_substitution"
      ? "create_rectificativa_substitution"
      : "create_f3_replacement";

    const { data: creation, error: creationError } = await userClient.rpc(rpcName, {
      p_original_invoice_id: originalInvoiceId,
      p_series_id: seriesId,
      p_recipient: recipient,
      p_update_patient: updatePatient,
      p_idempotency_key: idempotencyKey,
    });

    if (creationError || !creation) {
      console.error("[fix-invoice-type] Atomic creation failed", creationError);
      const message = creationError?.message || "No se pudo crear la factura de sustitucion";
      const conflict = /idempotencia|ya existe|correccion activa|duplicate/i.test(message);
      return jsonResponse(conflict ? 409 : 422, corsHeaders, {
        error: message,
        code: conflict ? "concurrent_operation" : "validation_error",
      });
    }

    operationId = String(creation.operation_id);
    const resultingInvoiceId = String(creation.invoice_id);

    const { data: resultingInvoice } = await serviceClient
      .from("invoices")
      .select("invoice_number, verifactu_registration_id, verifactu_hash")
      .eq("id", resultingInvoiceId)
      .single();

    if (creation.status === "registered" || resultingInvoice?.verifactu_registration_id) {
      return jsonResponse(200, corsHeaders, {
        success: true,
        status: "already_completed",
        operation_id: operationId,
        invoice_id: resultingInvoiceId,
        invoice_number: resultingInvoice?.invoice_number || creation.invoice_number,
        csv: resultingInvoice?.verifactu_registration_id || null,
      });
    }

    await serviceClient
      .from("invoice_correction_operations")
      .update({ status: "registering", error_code: null, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", operationId);

    let signResponse: Response;
    try {
      signResponse = await fetch(`${supabaseUrl}/functions/v1/sign-invoice-verifactu`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoice_id: resultingInvoiceId }),
      });
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : "Sin respuesta del registro AEAT";
      await serviceClient
        .from("invoice_correction_operations")
        .update({
          status: "pending_aeat",
          error_code: "network_error",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", operationId);

      return jsonResponse(202, corsHeaders, {
        success: false,
        status: "pending_aeat",
        operation_id: operationId,
        invoice_id: resultingInvoiceId,
        invoice_number: creation.invoice_number,
        message: "Factura creada. El registro AEAT se reintentara sobre la misma factura.",
      });
    }

    const signData = await signResponse.json().catch(() => ({})) as Record<string, unknown>;

    if (signResponse.ok && signData.success === true) {
      await serviceClient
        .from("invoice_correction_operations")
        .update({ status: "registered", error_code: null, error_message: null, updated_at: new Date().toISOString() })
        .eq("id", operationId);

      return jsonResponse(200, corsHeaders, {
        success: true,
        status: "registered",
        operation_id: operationId,
        invoice_id: resultingInvoiceId,
        invoice_number: creation.invoice_number,
        verifactu_invoice_type: creation.verifactu_invoice_type,
        csv: signData.csv || null,
        environment: signData.environment || null,
      });
    }

    const isPending = signData.pending === true || signData.aeat_unavailable === true;
    const isRejected = signData.permanent === true;
    const nextStatus = isPending ? "pending_aeat" : isRejected ? "rejected" : "manual_review";
    const errorMessage = String(signData.error || signData.message || "No se pudo completar el registro AEAT");

    await serviceClient
      .from("invoice_correction_operations")
      .update({
        status: nextStatus,
        error_code: signData.error_code ? String(signData.error_code) : null,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operationId);

    return jsonResponse(isPending ? 202 : 422, corsHeaders, {
      success: false,
      status: nextStatus,
      operation_id: operationId,
      invoice_id: resultingInvoiceId,
      invoice_number: creation.invoice_number,
      error: errorMessage,
      error_code: signData.error_code || null,
    });
  } catch (error) {
    console.error("[fix-invoice-type] Unhandled error", error);
    if (operationId) {
      await serviceClient
        .from("invoice_correction_operations")
        .update({
          status: "manual_review",
          error_code: "internal_error",
          error_message: error instanceof Error ? error.message : "Error interno",
          updated_at: new Date().toISOString(),
        })
        .eq("id", operationId);
    }

    return jsonResponse(500, corsHeaders, {
      error: "Error interno al corregir el tipo de factura",
      code: "internal_error",
    });
  }
});

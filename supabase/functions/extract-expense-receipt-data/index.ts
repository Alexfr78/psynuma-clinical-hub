import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hasAuthenticatedJWT, unauthorizedResponse } from '../_shared/authGuard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres un asistente de contabilidad experto en facturas y tickets españoles.
Analiza la imagen/documento adjunto y devuelve SOLO un JSON con estos campos
(usa null si no puedes determinar un valor con confianza):
{
  "supplier_name": string|null,
  "supplier_tax_id": string|null,
  "invoice_number": string|null,
  "issue_date": "YYYY-MM-DD"|null,
  "tax_base": number|null,
  "vat_rate": number|null,
  "vat_amount": number|null,
  "irpf_rate": number|null,
  "irpf_amount": number|null,
  "total_amount": number|null,
  "currency": "EUR"|string|null
}
No inventes cifras. Si el documento no es legible o no es una factura/ticket,
devuelve todos los campos como null.`;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await hasAuthenticatedJWT(req))) return unauthorizedResponse(corsHeaders);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let expenseId: string | undefined;

  try {
    const body = await req.json();
    expenseId = body.expenseId;
    const requestedAttachmentPath: string | undefined = body.attachmentPath;

    if (!expenseId) {
      return new Response(
        JSON.stringify({ error: 'Falta expenseId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve the calling user's center and confirm the expense belongs to it.
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return unauthorizedResponse(corsHeaders);

    const { data: callerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError || !callerProfile?.center_id) return unauthorizedResponse(corsHeaders);

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id, center_id, created_by, professional_id, attachment_path')
      .eq('id', expenseId)
      .maybeSingle();
    if (expenseError || !expense) {
      return new Response(
        JSON.stringify({ error: 'Gasto no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (expense.center_id !== callerProfile.center_id) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Row-level authorization mirroring the RLS policies on `expenses`: this
    // function runs with service_role (which bypasses RLS), so the same rule
    // must be enforced here — admins of the center, the creator of the
    // expense, or the professional it settles can trigger extraction; other
    // professionals of the same center cannot.
    const { data: callerIsAdmin } = await supabase.rpc('is_admin', { _user_id: userData.user.id });
    const isOwner =
      expense.created_by === userData.user.id || expense.professional_id === userData.user.id;
    if (!callerIsAdmin && !isOwner) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Never download a caller-supplied path: only the attachment already
    // persisted on this expense row can be processed.
    const attachmentPath = expense.attachment_path;
    if (!attachmentPath) {
      return new Response(
        JSON.stringify({ error: 'El gasto no tiene justificante adjunto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (requestedAttachmentPath && requestedAttachmentPath !== attachmentPath) {
      return new Response(
        JSON.stringify({ error: 'El justificante indicado no corresponde a este gasto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await supabase.from('expenses').update({ ai_extraction_status: 'processing' }).eq('id', expenseId);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    // Download the attachment from Storage with full (service_role) access.
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('expense-receipts')
      .download(attachmentPath);
    if (downloadError || !fileBlob) {
      throw new Error('No se pudo descargar el justificante: ' + (downloadError?.message ?? 'desconocido'));
    }

    const mimeType = fileBlob.type || 'application/octet-stream';
    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const dataUri = `data:${mimeType};base64,${base64}`;

    // The Lovable AI gateway is OpenAI-chat-completions-compatible. Every
    // existing use of LOVABLE_API_KEY in this repo (interpret-emo-results,
    // interpret-mmpi2rf-results, etc.) is text-only — there is no verified
    // example in this codebase of sending an image/PDF. This is a reasonable
    // extrapolation from Gemini's OpenAI-compatible multimodal support, but
    // it has NOT been smoke-tested against the real gateway yet (see the
    // message drafted for Lovable). PDFs are sent as an OpenAI-style 'file'
    // content part with a data URI; if the gateway rejects that shape, images
    // (jpg/png/webp) still go through the image_url path below.
    const isPdf = mimeType === 'application/pdf';
    const userContent: unknown[] = [
      { type: 'text', text: 'Extrae los datos fiscales de este justificante de gasto.' },
      isPdf
        ? { type: 'file', file: { filename: attachmentPath.split('/').pop() || 'documento.pdf', file_data: dataUri } }
        : { type: 'image_url', image_url: { url: dataUri } },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[extract-expense-receipt-data] AI gateway error:', response.status, errorText);
      throw new Error(`Error del servicio de IA: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No se recibió respuesta del servicio de IA');
    }

    let extracted: Record<string, unknown>;
    try {
      const jsonMatch = typeof content === 'string' ? content.match(/\{[\s\S]*\}/) : null;
      if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta');
      extracted = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[extract-expense-receipt-data] Parse error:', parseError);
      throw new Error('Error al procesar la respuesta de IA');
    }

    // Only fill fields that are currently NULL — never overwrite what the
    // user has already typed manually.
    const { data: currentExpense } = await supabase
      .from('expenses')
      .select('supplier_invoice_number, invoice_issue_date, tax_base, vat_rate, vat_amount, irpf_rate, irpf_amount')
      .eq('id', expenseId)
      .maybeSingle();

    const updatePayload: Record<string, unknown> = {
      ai_extraction_status: 'done',
      ai_extraction_raw: aiResponse,
    };
    if (currentExpense) {
      if (currentExpense.supplier_invoice_number == null && extracted.invoice_number != null) {
        updatePayload.supplier_invoice_number = extracted.invoice_number;
      }
      if (currentExpense.invoice_issue_date == null && extracted.issue_date != null) {
        updatePayload.invoice_issue_date = extracted.issue_date;
      }
      if (currentExpense.tax_base == null && extracted.tax_base != null) {
        updatePayload.tax_base = extracted.tax_base;
      }
      if (currentExpense.vat_rate == null && extracted.vat_rate != null) {
        updatePayload.vat_rate = extracted.vat_rate;
      }
      if (currentExpense.vat_amount == null && extracted.vat_amount != null) {
        updatePayload.vat_amount = extracted.vat_amount;
      }
      if (currentExpense.irpf_rate == null && extracted.irpf_rate != null) {
        updatePayload.irpf_rate = extracted.irpf_rate;
      }
      if (currentExpense.irpf_amount == null && extracted.irpf_amount != null) {
        updatePayload.irpf_amount = extracted.irpf_amount;
      }
    }

    await supabase.from('expenses').update(updatePayload).eq('id', expenseId);

    return new Response(
      JSON.stringify({ success: true, extracted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[extract-expense-receipt-data] Error:', errorMessage);
    if (expenseId) {
      await supabase.from('expenses').update({ ai_extraction_status: 'failed' }).eq('id', expenseId);
    }
    return new Response(
      JSON.stringify({ error: 'No se pudo extraer la información del justificante' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

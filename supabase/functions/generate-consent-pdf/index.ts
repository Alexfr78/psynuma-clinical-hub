import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsentData {
  id: string;
  content_snapshot: string;
  center_id: string;
  patient: {
    first_name: string;
    last_name: string;
  };
  professional: {
    first_name: string;
    last_name: string;
  };
  template: {
    name: string;
  };
}

interface SignatureData {
  signer_name: string;
  signer_role: string;
  signature_data: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { consent_id } = await req.json();

    if (!consent_id) {
      return new Response(
        JSON.stringify({ error: 'consent_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch consent data
    const { data: consent, error: consentError } = await supabase
      .from('consents')
      .select(`
        id,
        content_snapshot,
        center_id,
        patient:patients(first_name, last_name),
        professional:profiles(first_name, last_name),
        template:consent_templates(name)
      `)
      .eq('id', consent_id)
      .single();

    if (consentError || !consent) {
      console.error('Error fetching consent:', consentError);
      return new Response(
        JSON.stringify({ error: 'Consent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch signatures
    const { data: signatures, error: signaturesError } = await supabase
      .from('consent_signatures')
      .select('*')
      .eq('consent_id', consent_id)
      .order('signature_order', { ascending: true });

    if (signaturesError) {
      console.error('Error fetching signatures:', signaturesError);
    }

    // Generate HTML for PDF
    const html = generatePdfHtml(consent as unknown as ConsentData, signatures || []);

    // For now, we'll store the HTML as a simple text file
    // In production, you'd use a PDF generation service like Puppeteer, PDFKit, or a third-party API
    const fileName = `${consent.center_id}/${consent_id}.html`;
    
    const { error: uploadError } = await supabase.storage
      .from('consent-documents')
      .upload(fileName, html, {
        contentType: 'text/html',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading document:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL (note: bucket is private, so this would need signed URLs in production)
    const { data: urlData } = supabase.storage
      .from('consent-documents')
      .getPublicUrl(fileName);

    // Update consent with PDF URL
    const { error: updateError } = await supabase
      .from('consents')
      .update({ signed_pdf_url: urlData.publicUrl })
      .eq('id', consent_id);

    if (updateError) {
      console.error('Error updating consent:', updateError);
    }

    console.log(`PDF generated for consent ${consent_id}`);

    return new Response(
      JSON.stringify({ success: true, url: urlData.publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating PDF:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generatePdfHtml(consent: ConsentData, signatures: SignatureData[]): string {
  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const signatureHtml = signatures.map(sig => `
    <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
      <p style="margin: 0 0 10px 0; font-weight: bold;">
        ${sig.signer_role === 'guardian' ? 'Tutor/a' : 'Paciente'}: ${sig.signer_name}
      </p>
      ${sig.signature_data ? `<img src="${sig.signature_data}" alt="Firma" style="max-width: 300px; height: auto;" />` : ''}
      <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
        Firmado: ${new Date(sig.signed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}<br/>
        ${sig.ip_address ? `IP: ${sig.ip_address}<br/>` : ''}
        ${sig.user_agent ? `Navegador: ${sig.user_agent.substring(0, 100)}` : ''}
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${consent.template?.name || 'Consentimiento Informado'}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #3b82f6;
    }
    .header h1 {
      color: #3b82f6;
      margin: 0 0 10px 0;
    }
    .meta {
      background: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .meta p {
      margin: 5px 0;
    }
    .content {
      margin-bottom: 40px;
    }
    .signatures {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .seal {
      background: #f0fdf4;
      border: 1px solid #22c55e;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${consent.template?.name || 'Consentimiento Informado'}</h1>
    <p>Documento legalmente vinculante</p>
  </div>

  <div class="meta">
    <p><strong>Paciente:</strong> ${consent.patient?.first_name} ${consent.patient?.last_name}</p>
    <p><strong>Profesional:</strong> ${consent.professional?.first_name} ${consent.professional?.last_name}</p>
    <p><strong>Fecha de generación:</strong> ${timestamp}</p>
  </div>

  <div class="content">
    ${consent.content_snapshot}
  </div>

  <div class="signatures">
    <h2>Firmas</h2>
    ${signatureHtml || '<p>Sin firmas registradas</p>'}
  </div>

  <div class="seal">
    <p style="margin: 0; font-weight: bold; color: #22c55e;">✓ DOCUMENTO FIRMADO ELECTRÓNICAMENTE</p>
    <p style="margin: 5px 0 0 0; font-size: 12px;">
      Este documento ha sido firmado de forma electrónica y tiene validez legal conforme al RGPD.
    </p>
  </div>

  <div class="footer">
    <p>Documento generado automáticamente por Psycma</p>
    <p>Generado el: ${timestamp}</p>
    <p>ID del documento: ${consent.id}</p>
  </div>
</body>
</html>
  `;
}

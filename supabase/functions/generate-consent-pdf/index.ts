import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsentData {
  id: string;
  content_snapshot: string;
  center_id: string;
  signed_at: string | null;
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
  id: string;
  signer_name: string;
  signer_role: string;
  signature_data: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

// Simple hash function for generating signature fingerprint
async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

    console.log(`Generating PDF for consent ${consent_id}`);

    // Fetch consent data
    const { data: consent, error: consentError } = await supabase
      .from('consents')
      .select(`
        id,
        content_snapshot,
        center_id,
        signed_at,
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

    // Generate document hash for QR
    const documentData = JSON.stringify({
      consent_id,
      patient: consent.patient,
      professional: consent.professional,
      signed_at: consent.signed_at,
      signatures: (signatures || []).map(s => ({
        signer_name: s.signer_name,
        signer_role: s.signer_role,
        signed_at: s.signed_at
      }))
    });
    const documentHash = await generateHash(documentData);
    console.log(`Document hash: ${documentHash.substring(0, 16)}...`);

    // Generate HTML for PDF with signatures embedded in document
    const html = generatePdfHtml(
      consent as unknown as ConsentData, 
      signatures || [], 
      documentHash
    );

    // Store as HTML file
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

    // Generate signed URL for private bucket (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('consent-documents')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Failed to create download URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update consent with signed PDF URL
    const { error: updateError } = await supabase
      .from('consents')
      .update({ signed_pdf_url: signedUrlData.signedUrl })
      .eq('id', consent_id);

    if (updateError) {
      console.error('Error updating consent:', updateError);
    }

    console.log(`PDF generated successfully for consent ${consent_id}`);

    return new Response(
      JSON.stringify({ success: true, url: signedUrlData.signedUrl, hash: documentHash }),
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

function generatePdfHtml(consent: ConsentData, signatures: SignatureData[], documentHash: string): string {
  const timestamp = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  // Generate QR code URL using a public QR code API
  const qrData = encodeURIComponent(`PSYCMA-CONSENT|ID:${consent.id}|HASH:${documentHash.substring(0, 32)}`);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrData}`;

  // Build signature blocks HTML
  const signatureBlocks = signatures.map(sig => `
    <div style="flex: 1; min-width: 250px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151;">
        ${sig.signer_role === 'guardian' ? 'Tutor/Representante Legal' : 'Paciente'}
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
        ${sig.signer_name}
      </p>
      ${sig.signature_data ? `
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; margin-bottom: 10px;">
          <img src="${sig.signature_data}" alt="Firma de ${sig.signer_name}" style="max-width: 200px; height: 60px; object-fit: contain;" />
        </div>
      ` : ''}
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">
        Firmado: ${new Date(sig.signed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
      </p>
    </div>
  `).join('');

  // Calculate signature hash for each signature
  const signatureHashes = signatures.map(sig => ({
    role: sig.signer_role,
    name: sig.signer_name,
    shortHash: sig.id.substring(0, 8).toUpperCase()
  }));

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${consent.template?.name || 'Consentimiento Informado'}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #1f2937;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #3b82f6;
    }
    .header h1 {
      color: #1e40af;
      margin: 0 0 8px 0;
      font-size: 24px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }
    .meta-info {
      background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 25px;
      border: 1px solid #bfdbfe;
    }
    .meta-info p {
      margin: 4px 0;
      font-size: 14px;
    }
    .meta-info strong {
      color: #1e40af;
    }
    .document-content {
      padding: 20px 0;
    }
    .document-content h1, .document-content h2, .document-content h3 {
      color: #1f2937;
    }
    
    /* Signature section - embedded at end of document */
    .signature-section {
      margin-top: 40px;
      padding-top: 25px;
      border-top: 2px dashed #d1d5db;
    }
    .signature-section h2 {
      font-size: 18px;
      color: #374151;
      margin: 0 0 20px 0;
      text-align: center;
    }
    .signatures-container {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      justify-content: center;
    }
    
    /* Verification seal */
    .verification-seal {
      margin-top: 30px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border: 2px solid #22c55e;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .qr-code {
      flex-shrink: 0;
    }
    .seal-info {
      flex: 1;
    }
    .seal-info .title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      color: #166534;
      font-size: 16px;
      margin: 0 0 10px 0;
    }
    .seal-info .hash-info {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #4b5563;
      background: white;
      padding: 8px;
      border-radius: 4px;
      word-break: break-all;
    }
    .seal-info .hash-label {
      font-size: 10px;
      color: #6b7280;
      margin-bottom: 3px;
    }
    
    /* Footer */
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    .footer p {
      margin: 3px 0;
    }
    
    @media print {
      body { padding: 20px; }
      .verification-seal { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${consent.template?.name || 'Consentimiento Informado'}</h1>
    <p class="subtitle">Documento legalmente vinculante - Firmado electrónicamente</p>
  </div>

  <div class="meta-info">
    <p><strong>Paciente:</strong> ${consent.patient?.first_name || ''} ${consent.patient?.last_name || ''}</p>
    <p><strong>Profesional:</strong> ${consent.professional?.first_name || ''} ${consent.professional?.last_name || ''}</p>
    <p><strong>Fecha de firma:</strong> ${consent.signed_at ? new Date(consent.signed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : timestamp}</p>
  </div>

  <div class="document-content">
    ${consent.content_snapshot}
  </div>

  <!-- Signature section embedded at end of document -->
  <div class="signature-section">
    <h2>Firmas Electrónicas</h2>
    ${signatures.length > 0 ? `
      <div class="signatures-container">
        ${signatureBlocks}
      </div>
    ` : '<p style="text-align: center; color: #9ca3af;">Sin firmas registradas</p>'}
  </div>

  <!-- Verification seal with QR -->
  <div class="verification-seal">
    <div class="qr-code">
      <img src="${qrCodeUrl}" alt="QR de verificación" width="120" height="120" />
    </div>
    <div class="seal-info">
      <p class="title">
        <span style="font-size: 20px;">✓</span>
        DOCUMENTO FIRMADO ELECTRÓNICAMENTE
      </p>
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #4b5563;">
        Este documento ha sido firmado de forma electrónica y tiene validez legal conforme al RGPD.
      </p>
      <div class="hash-label">Huella digital del documento:</div>
      <div class="hash-info">${documentHash}</div>
      ${signatureHashes.length > 0 ? `
        <div style="margin-top: 8px; font-size: 10px; color: #6b7280;">
          ${signatureHashes.map(h => `<span style="display: inline-block; margin-right: 12px;">ID ${h.role === 'guardian' ? 'Tutor' : 'Paciente'}: ${h.shortHash}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  </div>

  <div class="footer">
    <p>Documento generado automáticamente por Psycma</p>
    <p>ID: ${consent.id}</p>
    <p>${timestamp}</p>
  </div>
</body>
</html>
  `;
}

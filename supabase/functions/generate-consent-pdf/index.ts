import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import { getVerificationResponseValue, normalizeVerificationCheckboxes } from "../_shared/consent.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Best-effort: emails the signed PDF as an attachment. Failures are logged, never thrown —
// the patient already has the document via the download button either way.
async function sendConsentCopyEmail(params: {
  patientEmail: string;
  patientName: string;
  centerName: string;
  logoUrl: string | null;
  templateName: string;
  pdfBytes: Uint8Array;
  fileName: string;
}): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendApiKey || !resendFromEmail) {
    console.error("[generate-consent-pdf] RESEND not configured, skipping email copy");
    return;
  }

  const headerContent = params.logoUrl
    ? `<img src="${params.logoUrl}" alt="${params.centerName}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto;">`
    : `<span style="margin: 0; font-size: 20px; font-weight: bold; color: #1d4ed8;">${params.centerName}</span>`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;max-width:600px;">
<tr><td align="center" style="padding:24px 24px 20px 24px;border-bottom:1px solid #e2e8f0;">${headerContent}</td></tr>
<tr><td style="padding:24px;font-size:14px;line-height:1.6;color:#333333;">
<p>Hola ${params.patientName},</p>
<p>Adjuntamos la copia de tu consentimiento firmado: <strong>${params.templateName}</strong>.</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">Este es un mensaje automático enviado por ${params.centerName}.</td></tr>
</table></td></tr></table>
</body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${params.centerName} <${resendFromEmail}>`,
        to: [params.patientEmail],
        subject: `Copia de tu consentimiento firmado - ${params.templateName}`,
        html,
        attachments: [{ filename: params.fileName, content: uint8ToBase64(params.pdfBytes) }],
      }),
    });
    if (!response.ok) {
      console.error("[generate-consent-pdf] Error sending email copy:", await response.text());
    }
  } catch (error) {
    console.error("[generate-consent-pdf] Error sending email copy:", error);
  }
}

// Best-effort: sends the signed PDF as a real WhatsApp document attachment (not a link),
// via WasenderAPI's documentUrl field. Failures are logged, never thrown.
async function sendConsentCopyWhatsApp(
  supabase: SupabaseClient,
  params: {
    centerId: string;
    patientId: string;
    patientPhone: string;
    patientName: string;
    templateName: string;
    documentUrl: string;
    fileName: string;
  }
): Promise<void> {
  const wasenderApiKey = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");
  if (!wasenderApiKey) {
    console.error("[generate-consent-pdf] WasenderAPI not configured, skipping WhatsApp copy");
    return;
  }

  const { data: session } = await supabase
    .from("whatsapp_sessions")
    .select("wasender_session_id, status, api_key")
    .eq("center_id", params.centerId)
    .single();

  if (!session?.wasender_session_id || session.status !== "connected") {
    console.error("[generate-consent-pdf] WhatsApp session not connected, skipping WhatsApp copy");
    return;
  }

  let sessionApiKey = session.api_key as string | null;
  if (!sessionApiKey) {
    try {
      const infoRes = await fetch(
        `https://api.wasenderapi.com/api/whatsapp-sessions/${session.wasender_session_id}`,
        { headers: { "Authorization": `Bearer ${wasenderApiKey}`, "Accept": "application/json" } }
      );
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        sessionApiKey = infoData.data?.api_key || infoData.api_key || null;
        if (sessionApiKey) {
          await supabase
            .from("whatsapp_sessions")
            .update({ api_key: sessionApiKey, updated_at: new Date().toISOString() })
            .eq("center_id", params.centerId);
        }
      }
    } catch (error) {
      console.error("[generate-consent-pdf] Error fetching WhatsApp session api_key:", error);
    }
  }
  if (!sessionApiKey) {
    console.error("[generate-consent-pdf] No WhatsApp session api_key available, skipping WhatsApp copy");
    return;
  }

  let cleanPhone = params.patientPhone.replace(/\D/g, '');
  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) cleanPhone = '34' + cleanPhone;
  const to = `+${cleanPhone}`;
  const text = `Hola ${params.patientName}, aquí tienes la copia de tu consentimiento firmado: ${params.templateName}.`;

  const { data: messageRecord } = await supabase
    .from("whatsapp_messages")
    .insert({
      center_id: params.centerId,
      patient_id: params.patientId,
      phone: to,
      content: text,
      type: "document",
      message_type: "consent_copy",
      media_url: params.documentUrl,
      status: "queued",
    })
    .select()
    .single();

  try {
    const response = await fetch("https://www.wasenderapi.com/api/send-message", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sessionApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        text,
        documentUrl: params.documentUrl,
        fileName: params.fileName,
      }),
    });
    const result = await response.json();
    if (response.ok && result.success !== false) {
      if (messageRecord) {
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "sent",
            wasender_message_id: result.data?.id || result.message_id,
            sent_at: new Date().toISOString(),
          })
          .eq("id", messageRecord.id);
      }
    } else {
      console.error("[generate-consent-pdf] WasenderAPI error sending document:", result);
      if (messageRecord) {
        await supabase
          .from("whatsapp_messages")
          .update({ status: "failed", error_message: result.message || result.error || "Unknown error" })
          .eq("id", messageRecord.id);
      }
    }
  } catch (error) {
    console.error("[generate-consent-pdf] Error sending WhatsApp copy:", error);
    if (messageRecord) {
      await supabase
        .from("whatsapp_messages")
        .update({ status: "failed", error_message: (error as Error).message })
        .eq("id", messageRecord.id);
    }
  }
}

interface ConsentData {
  id: string;
  content_snapshot: string;
  center_id: string;
  signed_at: string | null;
  verification_responses: Record<string, boolean> | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  patient: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  professional: {
    first_name: string;
    last_name: string;
  };
  template: {
    name: string;
    verification_checkboxes: unknown;
    requires_emergency_contact: boolean | null;
  };
  center: {
    name: string;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    invoice_logo_url: string | null;
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

// Sanitize text for WinAnsi encoding (StandardFonts compatibility)
function sanitizeForPdf(text: string): string {
  return text
    // Remove zero-width and invisible Unicode characters
    // ZWJ (\u200D) se elimina por separado para evitar no-misleading-character-class
    .replace(/\u200D/g, '')
    .replace(/[\u200B\u200C\u200E\u200F\uFEFF\u00AD\u2028\u2029\u202A-\u202F\u2060-\u206F]/g, '')
    // Replace common Unicode symbols with ASCII equivalents
    .replace(/✓/g, '[X]')
    .replace(/✗/g, '[ ]')
    .replace(/•/g, '-')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/…/g, '...')
    .replace(/€/g, 'EUR')
    .replace(/©/g, '(c)')
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    // Spanish characters are supported in WinAnsi, but let's be safe with some
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/Á/g, 'A')
    .replace(/É/g, 'E')
    .replace(/Í/g, 'I')
    .replace(/Ó/g, 'O')
    .replace(/Ú/g, 'U')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    // Strip any remaining non-WinAnsi characters (keep basic Latin + Latin-1 Supplement)
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

// Replace verification placeholder with actual responses
function replaceVerificationPlaceholder(
  html: string,
  rawVerificationCheckboxes: unknown,
  verificationResponses: Record<string, boolean> | null
): string {
  const verificationCheckboxes = normalizeVerificationCheckboxes(rawVerificationCheckboxes);
  if (verificationCheckboxes.length === 0) {
    // Just remove the placeholder
    return html.replace(/\{campos_verificacion\}/gi, '');
  }

  // Build text representation for verification responses
  const responsesText = verificationCheckboxes.map((checkbox) => {
    const isAuthorized = getVerificationResponseValue(verificationResponses, checkbox.key) === true;
    const icon = isAuthorized ? '[X] AUTORIZO' : '[ ] NO AUTORIZO';
    return `${checkbox.label}\n   ${icon}`;
  }).join('\n\n');

  // Replace placeholder patterns
  const patterns = [
    /<div[^>]*>\s*<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>\s*<\/div>/gi,
    /<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>/gi,
    /<div[^>]*>\s*\{campos_verificacion\}\s*<\/div>/gi,
    /<p[^>]*>\s*\{campos_verificacion\}\s*<\/p>/gi,
    /\{campos_verificacion\}/gi,
  ];

  let result = html;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, `<p>${responsesText}</p>`);
      break;
    }
  }

  return result;
}

// Replace emergency contact placeholder with the saved contact details
function replaceEmergencyContactPlaceholder(
  html: string,
  requiresEmergencyContact: boolean | null,
  emergencyContactName: string | null,
  emergencyContactPhone: string | null
): string {
  if (!requiresEmergencyContact || (!emergencyContactName && !emergencyContactPhone)) {
    return html.replace(/\{contacto_emergencia\}/gi, '');
  }

  const contactText = `Contacto de emergencia: ${emergencyContactName || '-'} - ${emergencyContactPhone || '-'}`;

  const patterns = [
    /<div[^>]*>\s*<span[^>]*>\s*\{contacto_emergencia\}\s*<\/span>\s*<\/div>/gi,
    /<span[^>]*>\s*\{contacto_emergencia\}\s*<\/span>/gi,
    /<div[^>]*>\s*\{contacto_emergencia\}\s*<\/div>/gi,
    /<p[^>]*>\s*\{contacto_emergencia\}\s*<\/p>/gi,
    /\{contacto_emergencia\}/gi,
  ];

  let result = html;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, `<p>${contactText}</p>`);
      break;
    }
  }

  return result;
}

// Strip HTML tags and decode entities for plain text
function htmlToPlainText(html: string): string {
  // Remove script and style tags with their contents
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Replace block elements with newlines
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&aacute;/gi, 'a');
  text = text.replace(/&eacute;/gi, 'e');
  text = text.replace(/&iacute;/gi, 'i');
  text = text.replace(/&oacute;/gi, 'o');
  text = text.replace(/&uacute;/gi, 'u');
  text = text.replace(/&ntilde;/gi, 'n');
  text = text.replace(/&Ntilde;/gi, 'N');
  text = text.replace(/&uuml;/gi, 'u');
  
  // Clean up excessive whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  
  // Sanitize for PDF encoding
  return sanitizeForPdf(text.trim());
}

// Wrap text to fit within a given width
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  
  return lines;
}

// Draw text with automatic page breaks
function drawTextWithPageBreaks(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  text: string,
  font: PDFFont,
  fontSize: number,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  pageHeight: number,
  marginBottom: number
): { currentPage: PDFPage; currentY: number; pages: PDFPage[] } {
  const lines = wrapText(text, font, fontSize, maxWidth);
  let currentY = startY;
  let currentPage = pages[pages.length - 1];
  
  for (const line of lines) {
    if (currentY < marginBottom) {
      // Add new page
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      pages.push(currentPage);
      currentY = pageHeight - 50;
    }
    
    if (line.trim()) {
      currentPage.drawText(line, {
        x,
        y: currentY,
        size: fontSize,
        font,
        color: rgb(0.12, 0.15, 0.21),
      });
    }
    
    currentY -= lineHeight;
  }
  
  return { currentPage, currentY, pages };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { consent_id, access_token } = body;
    const { hasAuthenticatedJWT, unauthorizedResponse } = await import("../_shared/authGuard.ts");
    const isAuthed = await hasAuthenticatedJWT(req);

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

    // Fetch consent data with center info
    const { data: consent, error: consentError } = await supabase
      .from('consents')
      .select(`
        id,
        patient_id,
        content_snapshot,
        center_id,
        signed_at,
        verification_responses,
        emergency_contact_name,
        emergency_contact_phone,
        access_token,
        signed_pdf_url,
        patient:patients(first_name, last_name, email, phone),
        professional:profiles(first_name, last_name),
        template:consent_templates(name, verification_checkboxes, requires_emergency_contact),
        center:centers(name, address, city, postal_code, invoice_logo_url)
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

    if (!isAuthed && (!access_token || access_token !== (consent as { access_token?: string | null }).access_token)) {
      return unauthorizedResponse(corsHeaders);
    }

    const isFirstGeneration = !consent.signed_pdf_url;

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

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Page dimensions (A4)
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const contentWidth = pageWidth - 2 * margin;
    
    let pages: PDFPage[] = [pdfDoc.addPage([pageWidth, pageHeight])];
    let currentPage = pages[0];
    let currentY = pageHeight - margin;

    const typedConsent = consent as unknown as ConsentData;

    // Try to embed center logo
    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
    if (typedConsent.center?.invoice_logo_url) {
      try {
        console.log('Fetching logo from:', typedConsent.center.invoice_logo_url);
        const logoResponse = await fetch(typedConsent.center.invoice_logo_url);
        if (logoResponse.ok) {
          const logoBytes = await logoResponse.arrayBuffer();
          const logoUint8 = new Uint8Array(logoBytes);
          
          // Try PNG first, then JPG
          try {
            logoImage = await pdfDoc.embedPng(logoUint8);
          } catch {
            try {
              logoImage = await pdfDoc.embedJpg(logoUint8);
            } catch (jpgError) {
              console.error('Could not embed logo as PNG or JPG:', jpgError);
            }
          }
        }
      } catch (logoError) {
        console.error('Error fetching logo:', logoError);
      }
    }

    // Draw header with logo
    if (logoImage) {
      const logoMaxHeight = 50;
      const logoMaxWidth = 150;
      const logoScale = Math.min(logoMaxWidth / logoImage.width, logoMaxHeight / logoImage.height);
      const logoWidth = logoImage.width * logoScale;
      const logoHeight = logoImage.height * logoScale;
      
      currentPage.drawImage(logoImage, {
        x: margin,
        y: currentY - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      
      // Center name next to logo
      currentPage.drawText(sanitizeForPdf(typedConsent.center?.name || 'Centro'), {
        x: margin + logoWidth + 15,
        y: currentY - 20,
        size: 16,
        font: helveticaBold,
        color: rgb(0.12, 0.25, 0.55),
      });
      
      // Center address
      const address = [
        typedConsent.center?.address,
        typedConsent.center?.city,
        typedConsent.center?.postal_code
      ].filter(Boolean).join(', ');
      
      if (address) {
        currentPage.drawText(sanitizeForPdf(address), {
          x: margin + logoWidth + 15,
          y: currentY - 38,
          size: 10,
          font: helvetica,
          color: rgb(0.42, 0.45, 0.49),
        });
      }
      
      currentY -= Math.max(logoHeight, 50) + 20;
    } else {
      // No logo, just center name
      currentPage.drawText(sanitizeForPdf(typedConsent.center?.name || 'Centro'), {
        x: margin,
        y: currentY - 20,
        size: 18,
        font: helveticaBold,
        color: rgb(0.12, 0.25, 0.55),
      });
      currentY -= 50;
    }

    // Draw separator line
    currentPage.drawLine({
      start: { x: margin, y: currentY },
      end: { x: pageWidth - margin, y: currentY },
      thickness: 2,
      color: rgb(0.23, 0.51, 0.96),
    });
    currentY -= 30;

    // Document title
    const templateName = sanitizeForPdf(typedConsent.template?.name || 'Consentimiento Informado');
    currentPage.drawText(templateName, {
      x: margin,
      y: currentY,
      size: 18,
      font: helveticaBold,
      color: rgb(0.12, 0.15, 0.21),
    });
    currentY -= 25;

    currentPage.drawText('Documento firmado electronicamente', {
      x: margin,
      y: currentY,
      size: 10,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.49),
    });
    currentY -= 35;

    // Meta info box
    const boxHeight = 70;
    currentPage.drawRectangle({
      x: margin,
      y: currentY - boxHeight,
      width: contentWidth,
      height: boxHeight,
      color: rgb(0.94, 0.97, 1),
      borderColor: rgb(0.75, 0.86, 0.99),
      borderWidth: 1,
    });

    const patientName = sanitizeForPdf(`${typedConsent.patient?.first_name || ''} ${typedConsent.patient?.last_name || ''}`.trim());
    const professionalName = sanitizeForPdf(`${typedConsent.professional?.first_name || ''} ${typedConsent.professional?.last_name || ''}`.trim());
    const signedDate = sanitizeForPdf(typedConsent.signed_at 
      ? new Date(typedConsent.signed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      : new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));

    currentPage.drawText('Paciente:', { x: margin + 10, y: currentY - 20, size: 10, font: helveticaBold, color: rgb(0.12, 0.25, 0.55) });
    currentPage.drawText(patientName, { x: margin + 70, y: currentY - 20, size: 10, font: helvetica, color: rgb(0.12, 0.15, 0.21) });
    
    currentPage.drawText('Profesional:', { x: margin + 10, y: currentY - 38, size: 10, font: helveticaBold, color: rgb(0.12, 0.25, 0.55) });
    currentPage.drawText(professionalName, { x: margin + 80, y: currentY - 38, size: 10, font: helvetica, color: rgb(0.12, 0.15, 0.21) });
    
    currentPage.drawText('Fecha de firma:', { x: margin + 10, y: currentY - 56, size: 10, font: helveticaBold, color: rgb(0.12, 0.25, 0.55) });
    currentPage.drawText(signedDate, { x: margin + 100, y: currentY - 56, size: 10, font: helvetica, color: rgb(0.12, 0.15, 0.21) });

    currentY -= boxHeight + 30;

    // Document content - replace verification and emergency contact placeholders with actual values
    const contentWithVerifications = replaceVerificationPlaceholder(
      typedConsent.content_snapshot || '',
      typedConsent.template?.verification_checkboxes || null,
      typedConsent.verification_responses || null
    );
    const contentWithEmergencyContact = replaceEmergencyContactPlaceholder(
      contentWithVerifications,
      typedConsent.template?.requires_emergency_contact || null,
      typedConsent.emergency_contact_name || null,
      typedConsent.emergency_contact_phone || null
    );
    const plainText = htmlToPlainText(contentWithEmergencyContact);
    const result = drawTextWithPageBreaks(
      pdfDoc,
      pages,
      plainText,
      helvetica,
      11,
      margin,
      currentY,
      contentWidth,
      16,
      pageHeight,
      150 // Leave space for signatures at bottom
    );
    
    pages = result.pages;
    currentPage = result.currentPage;
    currentY = result.currentY;

    // Check if we need a new page for signatures
    if (currentY < 280) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      pages.push(currentPage);
      currentY = pageHeight - margin;
    }

    // Signatures section
    currentY -= 20;
    
    // Dashed separator
    for (let i = margin; i < pageWidth - margin; i += 10) {
      currentPage.drawLine({
        start: { x: i, y: currentY },
        end: { x: i + 5, y: currentY },
        thickness: 1,
        color: rgb(0.82, 0.84, 0.86),
      });
    }
    currentY -= 25;

    currentPage.drawText('FIRMAS ELECTRONICAS', {
      x: (pageWidth - helveticaBold.widthOfTextAtSize('FIRMAS ELECTRONICAS', 14)) / 2,
      y: currentY,
      size: 14,
      font: helveticaBold,
      color: rgb(0.22, 0.26, 0.31),
    });
    currentY -= 30;

    // Draw each signature
    const signaturesList = signatures || [];
    const signatureWidth = signaturesList.length === 1 ? contentWidth : (contentWidth - 20) / 2;
    
    for (let i = 0; i < signaturesList.length; i++) {
      const sig = signaturesList[i] as SignatureData;
      const xOffset = signaturesList.length === 1 ? margin : (margin + i * (signatureWidth + 20));
      
      // Signature box
      currentPage.drawRectangle({
        x: xOffset,
        y: currentY - 100,
        width: signatureWidth,
        height: 100,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.9, 0.91, 0.92),
        borderWidth: 1,
      });
      
      // Role
      const roleText = sig.signer_role === 'guardian' ? 'Tutor/Representante Legal' : 'Paciente';
      currentPage.drawText(roleText, {
        x: xOffset + 10,
        y: currentY - 18,
        size: 11,
        font: helveticaBold,
        color: rgb(0.22, 0.26, 0.31),
      });
      
      // Name
      currentPage.drawText(sanitizeForPdf(sig.signer_name), {
        x: xOffset + 10,
        y: currentY - 34,
        size: 10,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.49),
      });
      
      // Try to embed signature image
      if (sig.signature_data && sig.signature_data.startsWith('data:image')) {
        try {
          const base64Data = sig.signature_data.split(',')[1];
          const signatureBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          
          let signatureImage;
          try {
            signatureImage = await pdfDoc.embedPng(signatureBytes);
          } catch {
            // If PNG fails, it might be a different format
            console.log('Could not embed signature as PNG');
          }
          
          if (signatureImage) {
            const sigMaxWidth = signatureWidth - 20;
            const sigMaxHeight = 40;
            const sigScale = Math.min(sigMaxWidth / signatureImage.width, sigMaxHeight / signatureImage.height);
            const sigWidth = signatureImage.width * sigScale;
            const sigHeight = signatureImage.height * sigScale;
            
            currentPage.drawImage(signatureImage, {
              x: xOffset + 10,
              y: currentY - 45 - sigHeight,
              width: sigWidth,
              height: sigHeight,
            });
          }
        } catch (sigError) {
          console.error('Error embedding signature:', sigError);
        }
      }
      
      // Signed date
      const sigDate = sanitizeForPdf(new Date(sig.signed_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }));
      currentPage.drawText(`Firmado: ${sigDate}`, {
        x: xOffset + 10,
        y: currentY - 92,
        size: 8,
        font: helvetica,
        color: rgb(0.61, 0.64, 0.68),
      });
    }
    
    currentY -= 120;

    // Verification seal
    if (currentY < 150) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      pages.push(currentPage);
      currentY = pageHeight - margin;
    }

    // Green verification box
    currentPage.drawRectangle({
      x: margin,
      y: currentY - 100,
      width: contentWidth,
      height: 100,
      color: rgb(0.94, 0.99, 0.95),
      borderColor: rgb(0.13, 0.77, 0.37),
      borderWidth: 2,
    });

    // QR Code
    const qrData = encodeURIComponent(`PSYCMA-CONSENT|ID:${consent_id}|HASH:${documentHash.substring(0, 32)}`);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;
    
    try {
      const qrResponse = await fetch(qrCodeUrl);
      if (qrResponse.ok) {
        const qrBytes = await qrResponse.arrayBuffer();
        const qrImage = await pdfDoc.embedPng(new Uint8Array(qrBytes));
        currentPage.drawImage(qrImage, {
          x: margin + 10,
          y: currentY - 90,
          width: 70,
          height: 70,
        });
      }
    } catch (qrError) {
      console.error('Error fetching QR code:', qrError);
    }

    // Verification text
    currentPage.drawText('[X] DOCUMENTO FIRMADO ELECTRONICAMENTE', {
      x: margin + 95,
      y: currentY - 20,
      size: 12,
      font: helveticaBold,
      color: rgb(0.09, 0.4, 0.2),
    });

    currentPage.drawText('Este documento ha sido firmado electronicamente y tiene validez legal.', {
      x: margin + 95,
      y: currentY - 38,
      size: 9,
      font: helvetica,
      color: rgb(0.29, 0.33, 0.39),
    });

    currentPage.drawText('Huella digital del documento:', {
      x: margin + 95,
      y: currentY - 55,
      size: 8,
      font: helvetica,
      color: rgb(0.42, 0.45, 0.49),
    });

    // Hash (truncated to fit)
    const displayHash = documentHash.substring(0, 48) + '...';
    currentPage.drawText(displayHash, {
      x: margin + 95,
      y: currentY - 68,
      size: 7,
      font: helvetica,
      color: rgb(0.29, 0.33, 0.39),
    });

    // Signature IDs
    const sigIds = signaturesList.map(s => `ID ${s.signer_role === 'guardian' ? 'Tutor' : 'Paciente'}: ${s.id.substring(0, 8).toUpperCase()}`).join('  |  ');
    if (sigIds) {
      currentPage.drawText(sigIds, {
        x: margin + 95,
        y: currentY - 85,
        size: 7,
        font: helvetica,
        color: rgb(0.42, 0.45, 0.49),
      });
    }

    currentY -= 120;

    // Footer
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    
    currentPage.drawText(`Documento generado por Psycma | ID: ${consent_id}`, {
      x: margin,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.61, 0.64, 0.68),
    });
    
    currentPage.drawText(timestamp, {
      x: pageWidth - margin - helvetica.widthOfTextAtSize(timestamp, 8),
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.61, 0.64, 0.68),
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    // Store PDF file
    const fileName = `${consent.center_id}/${consent_id}.pdf`;
    
    const { error: uploadError } = await supabase.storage
      .from('consent-documents')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError);
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

    // Send the signed copy to the patient by every channel available, only on first
    // generation (i.e. right after signing) — re-downloads don't re-send.
    if (isFirstGeneration) {
      const pdfFileName = `${templateName || 'consentimiento'}.pdf`;
      const sends: Promise<void>[] = [];
      if (typedConsent.patient?.email) {
        sends.push(sendConsentCopyEmail({
          patientEmail: typedConsent.patient.email,
          patientName,
          centerName: typedConsent.center?.name || 'Psycma',
          logoUrl: typedConsent.center?.invoice_logo_url || null,
          templateName,
          pdfBytes,
          fileName: pdfFileName,
        }));
      }
      if (typedConsent.patient?.phone) {
        sends.push(sendConsentCopyWhatsApp(supabase, {
          centerId: consent.center_id,
          patientId: consent.patient_id,
          patientPhone: typedConsent.patient.phone,
          patientName,
          templateName,
          documentUrl: signedUrlData.signedUrl,
          fileName: pdfFileName,
        }));
      }
      await Promise.allSettled(sends);
    }

    console.log(`PDF generated successfully for consent ${consent_id}`);

    return new Response(
      JSON.stringify({ success: true, url: signedUrlData.signedUrl, hash: documentHash }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating PDF:', error);
    console.error("[generate-consent-pdf] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

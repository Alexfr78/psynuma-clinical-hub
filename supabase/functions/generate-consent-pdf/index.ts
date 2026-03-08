import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsentData {
  id: string;
  content_snapshot: string;
  center_id: string;
  signed_at: string | null;
  verification_responses: Record<string, boolean> | null;
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
    verification_checkboxes: string[] | null;
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
    .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2028\u2029\u202A-\u202F\u2060-\u206F]/g, '')
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
  verificationCheckboxes: string[] | null,
  verificationResponses: Record<string, boolean> | null
): string {
  if (!verificationCheckboxes || verificationCheckboxes.length === 0) {
    // Just remove the placeholder
    return html.replace(/\{campos_verificacion\}/gi, '');
  }

  // Build text representation for verification responses
  const responsesText = verificationCheckboxes.map((checkbox, index) => {
    const response = verificationResponses?.[index.toString()];
    const isAuthorized = response === true;
    const icon = isAuthorized ? '[X] AUTORIZO' : '[ ] NO AUTORIZO';
    return `${checkbox}\n   ${icon}`;
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

    // Fetch consent data with center info
    const { data: consent, error: consentError } = await supabase
      .from('consents')
      .select(`
        id,
        content_snapshot,
        center_id,
        signed_at,
        verification_responses,
        patient:patients(first_name, last_name),
        professional:profiles(first_name, last_name),
        template:consent_templates(name, verification_checkboxes),
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

    // Document content - replace verification placeholder with actual responses
    const contentWithVerifications = replaceVerificationPlaceholder(
      typedConsent.content_snapshot || '',
      typedConsent.template?.verification_checkboxes || null,
      typedConsent.verification_responses || null
    );
    const plainText = htmlToPlainText(contentWithVerifications);
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

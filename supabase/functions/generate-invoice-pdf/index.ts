import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as QRCode from "https://esm.sh/qrcode@1.5.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";
import { sanitizeForPdf, wrapText, drawTextRightAligned, embedImageFromUrl } from "../_shared/pdfHelpers.ts";

interface InvoiceSeries {
  id: string;
  name: string;
  invoice_type: 'simplified' | 'complete' | null;
  series_type: 'ordinary' | 'rectifying' | null;
}

interface InvoiceData {
  id: string;
  center_id: string;
  invoice_number: string;
  invoice_type: 'simplified' | 'complete' | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  retention_rate: number | null;
  retention_amount: number | null;
  total: number;
  notes: string | null;
  verifactu_qr: string | null;
  verifactu_hash: string | null;
  verifactu_timestamp: string | null;
  verifactu_registration_id: string | null;
  is_recapitulative: boolean | null;
  rectified_invoice_id: string | null;
  rectification_type: string | null;
  verifactu_invoice_type: string | null;
  pdf_generated_at: string | null;
  recipient_snapshot: {
    name?: string | null;
    tax_id?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    email?: string | null;
  } | null;
  series_id: string | null;
  patients: {
    first_name: string;
    last_name: string;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    email: string | null;
  };
  centers: {
    name: string;
    invoice_data_protection_text: string | null;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    phone: string | null;
    email: string | null;
    invoice_logo_url: string | null;
    invoice_footer: string | null;
  };
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
  tax_amount: number | null;
  retention_rate: number | null;
  retention_amount: number | null;
  total: number;
}

interface RectifiedInvoice {
  invoice_number: string;
  issue_date: string;
}

interface InvoiceSubstitutionJoin {
  substituted_invoice: RectifiedInvoice | null;
}

/**
 * Unified invoice document type label logic
 * Must match the frontend implementation in src/lib/invoiceDocumentType.ts
 */
function getInvoiceDocumentTypeLabel(
  invoice: { invoice_type?: 'simplified' | 'complete' | null; is_recapitulative?: boolean | null; rectified_invoice_id?: string | null; rectification_type?: string | null; verifactu_invoice_type?: string | null },
  series: InvoiceSeries | null
): string {
  if (invoice.verifactu_invoice_type === 'F3') {
    return 'FACTURA COMPLETA EN SUSTITUCION DE FACTURA SIMPLIFICADA';
  }
  const isSimplified = (invoice.invoice_type ?? series?.invoice_type) === 'simplified';
  const isRectifying = !!invoice.rectified_invoice_id || series?.series_type === 'rectifying';
  const isSubstitution = invoice.rectification_type === 'substitution';
  const isRecapitulativa = !!invoice.is_recapitulative;

  if (isRectifying) {
    const rectTypeLabel = isSubstitution ? '(Sustitutiva)' : '(Por diferencias)';
    if (isSimplified) {
      return `FACTURA RECTIFICATIVA SIMPLIFICADA ${rectTypeLabel}`;
    }
    return `FACTURA RECTIFICATIVA ${rectTypeLabel}`;
  }

  if (isRecapitulativa) {
    if (isSimplified) {
      return 'FACTURA RECAPITULATIVA SIMPLIFICADA';
    }
    return 'FACTURA RECAPITULATIVA';
  }

  if (isSimplified) {
    return 'FACTURA SIMPLIFICADA';
  }

  return 'FACTURA';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} EUR`;
}

// A4 in points at 72dpi (210mm x 297mm). Every page created below must use this.
const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN = 40;

const ACCENT = rgb(0.145, 0.388, 0.921); // #2563eb
const ACCENT_DARK = rgb(0.114, 0.286, 0.635); // #1d4ed8
const TEXT_DARK = rgb(0.06, 0.09, 0.16); // #0f172a
const TEXT_MUTED = rgb(0.392, 0.455, 0.545); // #64748b
const BORDER = rgb(0.886, 0.910, 0.941); // #e2e8f0
const BOX_BG = rgb(0.973, 0.980, 0.988); // #f8fafc

async function generateInvoicePdfBytes(
  invoice: InvoiceData,
  items: InvoiceItem[],
  rectifiedInvoice: RectifiedInvoice | null,
  substitutedInvoices: RectifiedInvoice[],
  series: InvoiceSeries | null
): Promise<Uint8Array> {
  const [pageWidth, pageHeight] = PAGE_SIZE;
  const contentRight = pageWidth - MARGIN;

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [pdfDoc.addPage(PAGE_SIZE)];
  let page = pages[0];

  const newPage = (): PDFPage => {
    page = pdfDoc.addPage(PAGE_SIZE);
    pages.push(page);
    return page;
  };

  const invoiceTypeLabel = sanitizeForPdf(getInvoiceDocumentTypeLabel(invoice, series));
  const isF3 = invoice.verifactu_invoice_type === 'F3';
  const isSimplified = (invoice.invoice_type ?? series?.invoice_type) === 'simplified' && !isF3;
  const isRectifying = !!invoice.rectified_invoice_id || series?.series_type === 'rectifying';
  const isSubstitution = invoice.rectification_type === 'substitution';
  const isRecapitulativa = !!invoice.is_recapitulative;

  const badges: string[] = [];
  if (isSimplified) badges.push('Simplificada');
  if (isRectifying) badges.push(isSubstitution ? 'Sustitutiva' : 'Por diferencias');
  if (isRecapitulativa) badges.push('Recapitulativa');
  if (isF3) badges.push('F3 - Sustituye simplificada');

  // ---- Header: logo/center name (left) + invoice type/number/dates (right) ----
  let currentY = pageHeight - MARGIN;
  const headerTop = currentY;

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (invoice.centers?.invoice_logo_url) {
    logoImage = await embedImageFromUrl(pdfDoc, invoice.centers.invoice_logo_url);
  }

  let leftY = headerTop;
  if (logoImage) {
    const logoMaxHeight = 48;
    const logoMaxWidth = 160;
    const logoScale = Math.min(logoMaxWidth / logoImage.width, logoMaxHeight / logoImage.height, 1);
    const logoWidth = logoImage.width * logoScale;
    const logoHeight = logoImage.height * logoScale;
    page.drawImage(logoImage, { x: MARGIN, y: leftY - logoHeight, width: logoWidth, height: logoHeight });
    leftY -= logoHeight + 12;
  }

  page.drawText(sanitizeForPdf(invoice.centers?.name || 'Centro'), {
    x: MARGIN, y: leftY, size: 14, font: helveticaBold, color: ACCENT_DARK,
  });
  leftY -= 16;

  const centerMetaLines = [
    invoice.centers?.tax_id ? `NIF: ${invoice.centers.tax_id}` : null,
    invoice.centers?.address || null,
    [invoice.centers?.postal_code, invoice.centers?.city].filter(Boolean).join(' ') || null,
    invoice.centers?.phone ? `Tel: ${invoice.centers.phone}` : null,
    invoice.centers?.email || null,
  ].filter(Boolean) as string[];

  for (const line of centerMetaLines) {
    page.drawText(sanitizeForPdf(line), { x: MARGIN, y: leftY, size: 9, font: helvetica, color: TEXT_MUTED });
    leftY -= 12;
  }

  // Right column
  let rightY = headerTop - 2;
  drawTextRightAligned(page, invoiceTypeLabel, contentRight, rightY, 15, helveticaBold, TEXT_DARK);
  rightY -= 20;
  drawTextRightAligned(page, sanitizeForPdf(invoice.invoice_number), contentRight, rightY, 14, helveticaBold, ACCENT);
  rightY -= 18;
  drawTextRightAligned(page, `Fecha emision: ${formatDate(invoice.issue_date)}`, contentRight, rightY, 9, helvetica, TEXT_MUTED);
  rightY -= 12;
  if (invoice.due_date) {
    drawTextRightAligned(page, `Fecha vencimiento: ${formatDate(invoice.due_date)}`, contentRight, rightY, 9, helvetica, TEXT_MUTED);
    rightY -= 12;
  }
  if (badges.length > 0) {
    rightY -= 4;
    drawTextRightAligned(page, badges.join(' | '), contentRight, rightY, 8, helvetica, TEXT_MUTED);
    rightY -= 12;
  }

  currentY = Math.min(leftY, rightY) - 15;

  page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1.5, color: ACCENT });
  currentY -= 20;

  // ---- Rectified / substituted invoice notice ----
  if (rectifiedInvoice) {
    const text = sanitizeForPdf(`Factura rectificada: ${rectifiedInvoice.invoice_number} del ${formatDate(rectifiedInvoice.issue_date)}`);
    page.drawRectangle({ x: MARGIN, y: currentY - 22, width: contentRight - MARGIN, height: 22, color: rgb(0.996, 0.953, 0.780), borderColor: rgb(0.961, 0.620, 0.043), borderWidth: 1 });
    page.drawText(text, { x: MARGIN + 8, y: currentY - 15, size: 9, font: helvetica, color: rgb(0.573, 0.251, 0.055) });
    currentY -= 32;
  }
  if (substitutedInvoices.length > 0) {
    const label = substitutedInvoices.length > 1 ? 'Facturas simplificadas sustituidas' : 'Factura simplificada sustituida';
    const text = sanitizeForPdf(`${label}: ${substitutedInvoices.map((s) => `${s.invoice_number} del ${formatDate(s.issue_date)}`).join(', ')}`);
    const lines = wrapText(text, helvetica, 9, contentRight - MARGIN - 16);
    const boxHeight = 12 + lines.length * 12;
    page.drawRectangle({ x: MARGIN, y: currentY - boxHeight, width: contentRight - MARGIN, height: boxHeight, color: rgb(0.996, 0.953, 0.780), borderColor: rgb(0.961, 0.620, 0.043), borderWidth: 1 });
    let ly = currentY - 15;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 8, y: ly, size: 9, font: helvetica, color: rgb(0.573, 0.251, 0.055) });
      ly -= 12;
    }
    currentY -= boxHeight + 10;
  }

  // ---- Client info box ----
  const recipient = invoice.recipient_snapshot || {
    name: `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim(),
    tax_id: invoice.patients.tax_id,
    address: invoice.patients.address,
    city: invoice.patients.city,
    postal_code: invoice.patients.postal_code,
    email: invoice.patients.email,
  };
  const clientLines = [
    recipient.name || 'Cliente',
    recipient.tax_id ? `NIF/CIF: ${recipient.tax_id}` : null,
    recipient.address || null,
    [recipient.postal_code, recipient.city].filter(Boolean).join(' ') || null,
    recipient.email || null,
  ].filter(Boolean) as string[];

  const clientBoxHeight = 22 + clientLines.length * 13;
  page.drawRectangle({ x: MARGIN, y: currentY - clientBoxHeight, width: contentRight - MARGIN, height: clientBoxHeight, color: BOX_BG, borderColor: BORDER, borderWidth: 1 });
  page.drawText('Datos del cliente', { x: MARGIN + 10, y: currentY - 15, size: 10, font: helveticaBold, color: TEXT_DARK });
  let clientY = currentY - 30;
  clientLines.forEach((line, i) => {
    page.drawText(sanitizeForPdf(line), {
      x: MARGIN + 10, y: clientY, size: i === 0 ? 10 : 9, font: i === 0 ? helveticaBold : helvetica, color: i === 0 ? TEXT_DARK : TEXT_MUTED,
    });
    clientY -= 13;
  });
  currentY -= clientBoxHeight + 20;

  // ---- Items table ----
  const col = {
    concepto: MARGIN,
    conceptoMaxWidth: 220,
    cantRight: MARGIN + 300,
    precioRight: MARGIN + 380,
    ivaRight: MARGIN + 440,
    irpfRight: MARGIN + 500,
    totalRight: contentRight,
  };

  const drawTableHeader = () => {
    page.drawText('Concepto', { x: col.concepto, y: currentY, size: 9, font: helveticaBold, color: TEXT_DARK });
    drawTextRightAligned(page, 'Cant.', col.cantRight, currentY, 9, helveticaBold, TEXT_DARK);
    drawTextRightAligned(page, 'Precio', col.precioRight, currentY, 9, helveticaBold, TEXT_DARK);
    drawTextRightAligned(page, 'IVA', col.ivaRight, currentY, 9, helveticaBold, TEXT_DARK);
    drawTextRightAligned(page, 'IRPF', col.irpfRight, currentY, 9, helveticaBold, TEXT_DARK);
    drawTextRightAligned(page, 'Total', col.totalRight, currentY, 9, helveticaBold, TEXT_DARK);
    currentY -= 6;
    page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1, color: BORDER });
    currentY -= 14;
  };

  drawTableHeader();

  for (const item of items) {
    const descLines = wrapText(sanitizeForPdf(item.description || ''), helvetica, 9, col.conceptoMaxWidth);
    const rowHeight = Math.max(descLines.length, 1) * 12;

    if (currentY - rowHeight < 140) {
      newPage();
      currentY = pageHeight - MARGIN;
      drawTableHeader();
    }

    const rowTopY = currentY;
    descLines.forEach((line, i) => {
      page.drawText(line, { x: col.concepto, y: rowTopY - i * 12, size: 9, font: helvetica, color: TEXT_DARK });
    });
    drawTextRightAligned(page, String(item.quantity), col.cantRight, rowTopY, 9, helvetica, TEXT_DARK);
    drawTextRightAligned(page, formatCurrency(item.unit_price), col.precioRight, rowTopY, 9, helvetica, TEXT_DARK);
    drawTextRightAligned(page, item.tax_rate ? `${item.tax_rate}%` : '-', col.ivaRight, rowTopY, 9, helvetica, TEXT_DARK);
    drawTextRightAligned(page, item.retention_rate ? `-${item.retention_rate}%` : '-', col.irpfRight, rowTopY, 9, helvetica, TEXT_DARK);
    drawTextRightAligned(page, formatCurrency(item.total), col.totalRight, rowTopY, 9, helveticaBold, TEXT_DARK);

    currentY -= rowHeight + 8;
    page.drawLine({ start: { x: MARGIN, y: currentY + 4 }, end: { x: contentRight, y: currentY + 4 }, thickness: 0.5, color: BORDER });
  }

  currentY -= 10;

  // ---- Totals ----
  if (currentY < 150) {
    newPage();
    currentY = pageHeight - MARGIN;
  }

  const totalTax = items.reduce((sum, item) => sum + (Number(item.tax_amount) || 0), 0);
  const totalRetention = items.reduce((sum, item) => sum + (Number(item.retention_amount) || 0), 0);
  const avgTaxRate = items.find((i) => (i.tax_rate || 0) > 0)?.tax_rate || 0;
  const avgRetentionRate = items.find((i) => (i.retention_rate || 0) > 0)?.retention_rate || 0;

  const totalsLabelX = col.ivaRight - 60;
  page.drawText('Base imponible:', { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: TEXT_MUTED });
  drawTextRightAligned(page, formatCurrency(invoice.subtotal), col.totalRight, currentY, 9, helvetica, TEXT_DARK);
  currentY -= 14;

  if (totalTax > 0) {
    page.drawText(`IVA${avgTaxRate ? ` (${avgTaxRate}%)` : ''}:`, { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: TEXT_MUTED });
    drawTextRightAligned(page, formatCurrency(totalTax), col.totalRight, currentY, 9, helvetica, TEXT_DARK);
    currentY -= 14;
  }
  if (totalRetention > 0) {
    page.drawText(`Retencion IRPF${avgRetentionRate ? ` (${avgRetentionRate}%)` : ''}:`, { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: TEXT_MUTED });
    drawTextRightAligned(page, `-${formatCurrency(totalRetention)}`, col.totalRight, currentY, 9, helvetica, TEXT_MUTED);
    currentY -= 14;
  }

  page.drawLine({ start: { x: totalsLabelX, y: currentY + 4 }, end: { x: contentRight, y: currentY + 4 }, thickness: 1, color: BORDER });
  currentY -= 12;
  page.drawText('Total:', { x: totalsLabelX, y: currentY, size: 13, font: helveticaBold, color: TEXT_DARK });
  drawTextRightAligned(page, formatCurrency(invoice.total), col.totalRight, currentY, 13, helveticaBold, ACCENT);
  currentY -= 30;

  // ---- Notes ----
  if (invoice.notes) {
    if (currentY < 120) {
      newPage();
      currentY = pageHeight - MARGIN;
    }
    page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1, color: BORDER });
    currentY -= 16;
    page.drawText('Observaciones', { x: MARGIN, y: currentY, size: 10, font: helveticaBold, color: TEXT_DARK });
    currentY -= 14;
    const noteLines = wrapText(sanitizeForPdf(invoice.notes), helvetica, 9, contentRight - MARGIN);
    for (const line of noteLines) {
      if (currentY < 60) {
        newPage();
        currentY = pageHeight - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y: currentY, size: 9, font: helvetica, color: TEXT_MUTED });
      currentY -= 12;
    }
    currentY -= 10;
  }

  // ---- Verifactu QR ----
  if (invoice.verifactu_qr) {
    if (currentY < 120) {
      newPage();
      currentY = pageHeight - MARGIN;
    }
    page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1, color: BORDER });
    currentY -= 16;

    try {
      const qrDataUrl: string = await (QRCode as { toDataURL: (input: string, opts: Record<string, unknown>) => Promise<string> })
        .toDataURL(invoice.verifactu_qr, { type: 'image/png', width: 100, margin: 1, errorCorrectionLevel: 'M' });
      const qrBase64 = qrDataUrl.split(',')[1];
      const qrBytes = Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
      const qrImage = await pdfDoc.embedPng(qrBytes);
      page.drawImage(qrImage, { x: MARGIN, y: currentY - 90, width: 90, height: 90 });

      page.drawText('Factura registrada en Verifactu', { x: MARGIN + 100, y: currentY - 15, size: 10, font: helveticaBold, color: TEXT_DARK });
      const qrLines = wrapText('Puede verificar la autenticidad de esta factura escaneando el codigo QR', helvetica, 8, contentRight - MARGIN - 110);
      let qrY = currentY - 30;
      for (const line of qrLines) {
        page.drawText(line, { x: MARGIN + 100, y: qrY, size: 8, font: helvetica, color: TEXT_MUTED });
        qrY -= 11;
      }
      currentY -= 100;
    } catch (qrError) {
      console.error('[generate-invoice-pdf] Error generating QR:', qrError);
      currentY -= 10;
    }
  }

  // ---- Footer / data protection ----
  if (invoice.centers?.invoice_footer) {
    if (currentY < 80) {
      newPage();
      currentY = pageHeight - MARGIN;
    }
    currentY -= 6;
    page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1, color: BORDER });
    currentY -= 14;
    const footerLines = wrapText(sanitizeForPdf(invoice.centers.invoice_footer), helvetica, 8, contentRight - MARGIN);
    for (const line of footerLines) {
      if (currentY < 40) {
        newPage();
        currentY = pageHeight - MARGIN;
      }
      const width = helvetica.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: (pageWidth - width) / 2, y: currentY, size: 8, font: helvetica, color: TEXT_MUTED });
      currentY -= 11;
    }
  }

  if (invoice.centers?.invoice_data_protection_text) {
    if (currentY < 60) {
      newPage();
      currentY = pageHeight - MARGIN;
    }
    currentY -= 8;
    const protectionLines = wrapText(sanitizeForPdf(invoice.centers.invoice_data_protection_text), helvetica, 6, contentRight - MARGIN);
    for (const line of protectionLines) {
      if (currentY < 35) {
        newPage();
        currentY = pageHeight - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y: currentY, size: 6, font: helvetica, color: TEXT_MUTED });
      currentY -= 9;
    }
  }

  // Stamp every page with a generation footer
  const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  for (const p of pages) {
    p.drawText(`Documento generado por Psycma | Factura: ${sanitizeForPdf(invoice.invoice_number)}`, {
      x: MARGIN, y: 20, size: 7, font: helvetica, color: TEXT_MUTED,
    });
    const tsWidth = helvetica.widthOfTextAtSize(timestamp, 7);
    p.drawText(timestamp, { x: pageWidth - MARGIN - tsWidth, y: 20, size: 7, font: helvetica, color: TEXT_MUTED });
  }

  return await pdfDoc.save();
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const invoice_id = body.invoice_id || body.invoiceId;
    const access_token = body.access_token;
    const { hasAuthenticatedJWT, unauthorizedResponse } = await import("../_shared/authGuard.ts");
    const isAuthed = await hasAuthenticatedJWT(req);

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: "invoice_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        patients (first_name, last_name, tax_id, address, city, postal_code, email),
        centers (name, tax_id, address, city, postal_code, phone, email, invoice_logo_url, invoice_footer, invoice_data_protection_text)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice fetch error:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const invoiceAccessToken = (invoice as { access_token?: string | null }).access_token;
    if (!isAuthed && (!access_token || access_token !== invoiceAccessToken)) {
      return unauthorizedResponse(corsHeaders);
    }

    const invoiceData = invoice as InvoiceData;
    const filePath = `${invoiceData.center_id}/${invoice_id}.pdf`;

    // Invoices are legally immutable once issued: if the PDF was already
    // generated, reuse it instead of re-rendering. Only issue a fresh
    // signed URL (private bucket, so URLs expire).
    if (invoiceData.pdf_generated_at) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("invoice-documents")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);

      if (!signedUrlError && signedUrlData?.signedUrl) {
        logAuditEvent({
          supabase, req, userId: null, organizationId: invoiceData.center_id,
          patientId: invoice.patient_id, resourceType: "invoices", resourceId: invoice_id,
          action: "DOWNLOAD", routeOrEndpoint: "generate-invoice-pdf",
        });
        return new Response(
          JSON.stringify({
            success: true,
            url: signedUrlData.signedUrl,
            invoice: {
              number: invoiceData.invoice_number,
              date: invoiceData.issue_date,
              total: invoiceData.total,
              patient: `${invoiceData.patients.first_name} ${invoiceData.patients.last_name}`,
              has_verifactu: !!invoiceData.verifactu_hash,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // File missing despite pdf_generated_at being set (shouldn't normally
      // happen) - fall through and regenerate it.
      console.warn("[generate-invoice-pdf] Cached PDF missing, regenerating:", signedUrlError);
    }

    // Fetch series data if series_id exists
    let series: InvoiceSeries | null = null;
    if (invoice.series_id) {
      const { data: seriesData } = await supabase
        .from("invoice_series")
        .select("id, name, invoice_type, series_type")
        .eq("id", invoice.series_id)
        .single();
      if (seriesData) series = seriesData as InvoiceSeries;
    }

    // Fetch invoice items
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, tax_rate, tax_amount, retention_rate, retention_amount, total")
      .eq("invoice_id", invoice_id);

    if (itemsError) {
      console.error("Items fetch error:", itemsError);
    }

    // Fetch rectified invoice if exists
    let rectifiedInvoice: RectifiedInvoice | null = null;
    if (invoice.rectified_invoice_id) {
      const { data: rectified } = await supabase
        .from("invoices")
        .select("invoice_number, issue_date")
        .eq("id", invoice.rectified_invoice_id)
        .single();
      rectifiedInvoice = rectified;
    }

    let substitutedInvoices: RectifiedInvoice[] = [];
    if (invoice.verifactu_invoice_type === 'F3') {
      const { data: substitutions } = await supabase
        .from('invoice_substitutions')
        .select('substituted_invoice:invoices!substituted_invoice_id(invoice_number, issue_date)')
        .eq('replacement_invoice_id', invoice_id);
      substitutedInvoices = ((substitutions || []) as unknown as InvoiceSubstitutionJoin[])
        .map((row) => row.substituted_invoice)
        .filter((row): row is RectifiedInvoice => Boolean(row?.invoice_number && row?.issue_date));
    }

    const invoiceItems = (items || []) as InvoiceItem[];

    const pdfBytes = await generateInvoicePdfBytes(invoiceData, invoiceItems, rectifiedInvoice, substitutedInvoices, series);

    const { error: uploadError } = await supabase.storage
      .from("invoice-documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Error uploading invoice PDF:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload document" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("invoice-documents")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedUrlError || !signedUrlData) {
      console.error("Error creating signed URL:", signedUrlError);
      return new Response(
        JSON.stringify({ error: "Failed to create download URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("invoices")
      .update({ pdf_generated_at: new Date().toISOString() })
      .eq("id", invoice_id);

    logAuditEvent({
      supabase, req, userId: null, organizationId: invoice.center_id,
      patientId: invoice.patient_id, resourceType: 'invoices', resourceId: invoice_id,
      action: 'DOWNLOAD', routeOrEndpoint: 'generate-invoice-pdf',
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: signedUrlData.signedUrl,
        invoice: {
          number: invoiceData.invoice_number,
          date: invoiceData.issue_date,
          total: invoiceData.total,
          patient: `${invoiceData.patients.first_name} ${invoiceData.patients.last_name}`,
          has_verifactu: !!invoiceData.verifactu_hash,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

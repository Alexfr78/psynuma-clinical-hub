import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, PDFPage, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as QRCode from "https://esm.sh/qrcode@1.5.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";
import { callerErrorResponse, canActOnCenter, resolveCaller } from "../_shared/requireCaller.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { sanitizeForPdf, wrapText, drawTextRightAligned, embedImageFromUrl } from "../_shared/pdfHelpers.ts";
import { generateFormalInvoicePdfBytes } from "./formalTemplate.ts";
import { darken, isHexColor, parseHexColor, readableOnWhite, toPdf } from "./colors.ts";

// Every caller downloads or opens the PDF right away, so the link only needs
// to live long enough for that. A leaked link must not stay usable for months.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
    invoice_template: string | null;
    invoice_primary_color: string | null;
    invoice_secondary_color: string | null;
    invoice_license_line: string | null;
    invoice_signature_path: string | null;
    invoice_tax_exemption_note: string | null;
    bank_transfer_info: string | null;
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

async function verifactuQrPng(qrContent: string): Promise<Uint8Array> {
  const qrDataUrl: string = await (QRCode as { toDataURL: (input: string, opts: Record<string, unknown>) => Promise<string> })
    .toDataURL(qrContent, { type: 'image/png', width: 100, margin: 1, errorCorrectionLevel: 'M' });
  const qrBase64 = qrDataUrl.split(',')[1];
  return Uint8Array.from(atob(qrBase64), (c) => c.charCodeAt(0));
}

// Sin colores configurados se usan exactamente los de siempre.
function standardTheme(center: InvoiceData['centers'] | null | undefined) {
  const primary = parseHexColor(center?.invoice_primary_color);
  const secondary = parseHexColor(center?.invoice_secondary_color);
  return {
    accent: primary ? toPdf(readableOnWhite(primary, 3)) : ACCENT,
    accentDark: primary ? toPdf(readableOnWhite(darken(primary))) : ACCENT_DARK,
    muted: secondary ? toPdf(readableOnWhite(secondary)) : TEXT_MUTED,
  };
}

async function generateInvoicePdfBytes(
  invoice: InvoiceData,
  items: InvoiceItem[],
  rectifiedInvoice: RectifiedInvoice | null,
  substitutedInvoices: RectifiedInvoice[],
  series: InvoiceSeries | null
): Promise<Uint8Array> {
  const [pageWidth, pageHeight] = PAGE_SIZE;
  const theme = standardTheme(invoice.centers);
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
    x: MARGIN, y: leftY, size: 14, font: helveticaBold, color: theme.accentDark,
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
    page.drawText(sanitizeForPdf(line), { x: MARGIN, y: leftY, size: 9, font: helvetica, color: theme.muted });
    leftY -= 12;
  }

  // Right column
  let rightY = headerTop - 2;
  drawTextRightAligned(page, invoiceTypeLabel, contentRight, rightY, 15, helveticaBold, TEXT_DARK);
  rightY -= 20;
  drawTextRightAligned(page, sanitizeForPdf(invoice.invoice_number), contentRight, rightY, 14, helveticaBold, theme.accent);
  rightY -= 18;
  drawTextRightAligned(page, `Fecha emisión: ${formatDate(invoice.issue_date)}`, contentRight, rightY, 9, helvetica, theme.muted);
  rightY -= 12;
  if (invoice.due_date) {
    drawTextRightAligned(page, `Fecha vencimiento: ${formatDate(invoice.due_date)}`, contentRight, rightY, 9, helvetica, theme.muted);
    rightY -= 12;
  }
  if (badges.length > 0) {
    rightY -= 4;
    drawTextRightAligned(page, badges.join(' | '), contentRight, rightY, 8, helvetica, theme.muted);
    rightY -= 12;
  }

  currentY = Math.min(leftY, rightY) - 15;

  page.drawLine({ start: { x: MARGIN, y: currentY }, end: { x: contentRight, y: currentY }, thickness: 1.5, color: theme.accent });
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
  // Las facturas simplificadas no identifican al destinatario: no se muestran sus datos.
  if (!isSimplified) {
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
        x: MARGIN + 10, y: clientY, size: i === 0 ? 10 : 9, font: i === 0 ? helveticaBold : helvetica, color: i === 0 ? TEXT_DARK : theme.muted,
      });
      clientY -= 13;
    });
    currentY -= clientBoxHeight + 20;
  }

  // ---- Items table ----
  const col = {
    concepto: MARGIN,
    conceptoMaxWidth: 220,
    cantRight: contentRight - 240,
    precioRight: contentRight - 175,
    ivaRight: contentRight - 115,
    irpfRight: contentRight - 60,
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
  page.drawText('Base imponible:', { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: theme.muted });
  drawTextRightAligned(page, formatCurrency(invoice.subtotal), col.totalRight, currentY, 9, helvetica, TEXT_DARK);
  currentY -= 14;

  if (totalTax > 0) {
    page.drawText(`IVA${avgTaxRate ? ` (${avgTaxRate}%)` : ''}:`, { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: theme.muted });
    drawTextRightAligned(page, formatCurrency(totalTax), col.totalRight, currentY, 9, helvetica, TEXT_DARK);
    currentY -= 14;
  }
  if (totalRetention > 0) {
    page.drawText(`Retencion IRPF${avgRetentionRate ? ` (${avgRetentionRate}%)` : ''}:`, { x: totalsLabelX, y: currentY, size: 9, font: helvetica, color: theme.muted });
    drawTextRightAligned(page, `-${formatCurrency(totalRetention)}`, col.totalRight, currentY, 9, helvetica, theme.muted);
    currentY -= 14;
  }

  page.drawLine({ start: { x: totalsLabelX, y: currentY + 4 }, end: { x: contentRight, y: currentY + 4 }, thickness: 1, color: BORDER });
  currentY -= 12;
  page.drawText('Total:', { x: totalsLabelX, y: currentY, size: 13, font: helveticaBold, color: TEXT_DARK });
  drawTextRightAligned(page, formatCurrency(invoice.total), col.totalRight, currentY, 13, helveticaBold, theme.accent);
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
      page.drawText(line, { x: MARGIN, y: currentY, size: 9, font: helvetica, color: theme.muted });
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
      const qrImage = await pdfDoc.embedPng(await verifactuQrPng(invoice.verifactu_qr));
      page.drawImage(qrImage, { x: MARGIN, y: currentY - 90, width: 90, height: 90 });

      page.drawText('Factura registrada en Verifactu', { x: MARGIN + 100, y: currentY - 15, size: 10, font: helveticaBold, color: TEXT_DARK });
      const qrLines = wrapText('Puede verificar la autenticidad de esta factura escaneando el código QR', helvetica, 8, contentRight - MARGIN - 110);
      let qrY = currentY - 30;
      for (const line of qrLines) {
        page.drawText(line, { x: MARGIN + 100, y: qrY, size: 8, font: helvetica, color: theme.muted });
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
      page.drawText(line, { x: (pageWidth - width) / 2, y: currentY, size: 8, font: helvetica, color: theme.muted });
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
      page.drawText(line, { x: MARGIN, y: currentY, size: 6, font: helvetica, color: theme.muted });
      currentY -= 9;
    }
  }

  return await pdfDoc.save();
}

// Modelo "formal" (centers.invoice_template = 'formal'). Prepara los datos y
// las imágenes; el dibujo vive en formalTemplate.ts.
async function renderFormalInvoice(
  supabase: SupabaseClient,
  invoice: InvoiceData,
  items: InvoiceItem[],
  rectifiedInvoice: RectifiedInvoice | null,
  substitutedInvoices: RectifiedInvoice[],
  series: InvoiceSeries | null
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const isF3 = invoice.verifactu_invoice_type === 'F3';
  const isSimplified = (invoice.invoice_type ?? series?.invoice_type) === 'simplified' && !isF3;

  const logo = invoice.centers?.invoice_logo_url
    ? await embedImageFromUrl(pdfDoc, invoice.centers.invoice_logo_url)
    : null;

  // La firma está en el bucket privado: se descarga con la service role,
  // nunca por URL pública.
  let signature: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  const signaturePath = invoice.centers?.invoice_signature_path;
  // Solo las dos rutas que escribe la pantalla de ajustes: una ruta libre
  // (p. ej. con "..") permitiría leer archivos de otros centros con la service role.
  const allowedSignaturePaths = ['png', 'jpg'].map((ext) => `${invoice.center_id}/branding/invoice-signature.${ext}`);
  if (signaturePath && allowedSignaturePaths.includes(signaturePath)) {
    const { data: blob, error } = await supabase.storage.from("invoice-documents").download(signaturePath);
    if (error || !blob) {
      console.error('[generate-invoice-pdf] Signature download failed:', error);
    } else {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      try {
        signature = await pdfDoc.embedPng(bytes);
      } catch {
        try {
          signature = await pdfDoc.embedJpg(bytes);
        } catch (embedError) {
          console.error('[generate-invoice-pdf] Signature embed failed:', embedError);
        }
      }
    }
  }

  let qrImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (invoice.verifactu_qr) {
    try {
      qrImage = await pdfDoc.embedPng(await verifactuQrPng(invoice.verifactu_qr));
    } catch (qrError) {
      console.error('[generate-invoice-pdf] Error generating QR:', qrError);
    }
  }

  const notices: string[] = [];
  if (rectifiedInvoice) {
    notices.push(`Factura rectificada: ${rectifiedInvoice.invoice_number} del ${formatDate(rectifiedInvoice.issue_date)}`);
  }
  if (substitutedInvoices.length > 0) {
    const label = substitutedInvoices.length > 1 ? 'Facturas simplificadas sustituidas' : 'Factura simplificada sustituida';
    notices.push(`${label}: ${substitutedInvoices.map((s) => `${s.invoice_number} del ${formatDate(s.issue_date)}`).join(', ')}`);
  }

  const recipient = isSimplified ? null : (invoice.recipient_snapshot || {
    name: `${invoice.patients.first_name} ${invoice.patients.last_name}`.trim(),
    tax_id: invoice.patients.tax_id,
    address: invoice.patients.address,
    city: invoice.patients.city,
    postal_code: invoice.patients.postal_code,
  });

  const c = invoice.centers;
  return await generateFormalInvoicePdfBytes(pdfDoc, {
    documentLabel: getInvoiceDocumentTypeLabel(invoice, series),
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    subtotal: Number(invoice.subtotal) || 0,
    total: Number(invoice.total) || 0,
    headerTax: { rate: Number(invoice.tax_rate) || 0, amount: Number(invoice.tax_amount) || 0 },
    headerRetention: { rate: Number(invoice.retention_rate) || 0, amount: Number(invoice.retention_amount) || 0 },
    notes: invoice.notes,
    recipient,
    notices,
    items,
    center: {
      name: c?.name || 'Centro',
      tax_id: c?.tax_id ?? null,
      address: c?.address ?? null,
      city: c?.city ?? null,
      postal_code: c?.postal_code ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
      license_line: c?.invoice_license_line ?? null,
      bank_transfer_info: c?.bank_transfer_info ?? null,
      tax_exemption_note: c?.invoice_tax_exemption_note ?? null,
      footer: c?.invoice_footer ?? null,
      data_protection_text: c?.invoice_data_protection_text ?? null,
    },
    colors: {
      primary: parseHexColor(c?.invoice_primary_color),
      secondary: parseHexColor(c?.invoice_secondary_color),
    },
    logo,
    signature,
    qrImage,
  });
}

const CENTER_PDF_COLUMNS = "name, tax_id, address, city, postal_code, phone, email, invoice_logo_url, invoice_footer, invoice_data_protection_text, invoice_template, invoice_primary_color, invoice_secondary_color, invoice_license_line, invoice_signature_path, invoice_tax_exemption_note, bank_transfer_info";

// Ajustes que la pantalla de diseño puede probar sin guardar. Todo lo demás
// (nombre, NIF, dirección, logo, firma) sale siempre de la base de datos.
const PREVIEW_TEXT_LIMITS = {
  invoice_license_line: 120,
  invoice_tax_exemption_note: 300,
  invoice_footer: 2000,
  invoice_data_protection_text: 2000,
  bank_transfer_info: 2000,
} as const;

function applyPreviewOverrides(center: InvoiceData['centers'], raw: unknown): InvoiceData['centers'] {
  const overrides = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const next = { ...center };
  if (overrides.invoice_template === 'standard' || overrides.invoice_template === 'formal') {
    next.invoice_template = overrides.invoice_template;
  }
  for (const key of ['invoice_primary_color', 'invoice_secondary_color'] as const) {
    if (key in overrides) next[key] = isHexColor(overrides[key]) ? (overrides[key] as string).toLowerCase() : null;
  }
  for (const [key, max] of Object.entries(PREVIEW_TEXT_LIMITS) as [keyof typeof PREVIEW_TEXT_LIMITS, number][]) {
    if (!(key in overrides)) continue;
    const value = overrides[key];
    next[key] = typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
  }
  return next;
}

// Marca visible en cada página: el PDF de muestra lleva datos reales del centro
// (NIF, dirección, firma) y no debe poder pasar por una factura emitida.
async function watermarkAsSample(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = 'MUESTRA - SIN VALOR FISCAL';
  const size = 44;
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    // Centrado sobre la diagonal (45º): el centro del texto cae en el centro de la página.
    const offset = textWidth / 2 / Math.SQRT2;
    page.drawText(text, {
      x: width / 2 - offset, y: height / 2 - offset, size, font,
      color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(45),
    });
  }
  return await doc.save();
}

// Vista previa del diseño: factura de muestra con los datos reales del centro
// del usuario y los ajustes sin guardar. No toca facturas, no sube nada al
// storage y no lleva datos de pacientes.
async function handlePreview(
  req: Request,
  body: Record<string, unknown>,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const caller = await resolveCaller(req, supabase);
  if (!caller || caller.kind !== 'user') return callerErrorResponse(401, corsHeaders);

  const { data: centerRow, error } = await supabase
    .from('centers')
    .select(`${CENTER_PDF_COLUMNS}, default_tax_rate, retention_rate`)
    .eq('id', caller.centerId)
    .single();
  if (error || !centerRow) {
    console.error('[generate-invoice-pdf] Preview center fetch error:', error);
    return callerErrorResponse(403, corsHeaders);
  }

  const { default_tax_rate, retention_rate, ...centerColumns } = centerRow as Record<string, unknown>;
  const center = applyPreviewOverrides(centerColumns as InvoiceData['centers'], body.overrides);

  const taxRate = Number(default_tax_rate) || 0;
  const retentionRate = Number(retention_rate) || 0;
  const sampleLine = (description: string, price: number): InvoiceItem => {
    const tax = Math.round(price * taxRate) / 100;
    const retention = Math.round(price * retentionRate) / 100;
    return {
      description, quantity: 1, unit_price: price,
      tax_rate: taxRate, tax_amount: tax,
      retention_rate: retentionRate || null, retention_amount: retention || null,
      total: price + tax,
    };
  };
  const items = [
    sampleLine('Sesión de psicoterapia individual', 60),
    sampleLine('Sesión de evaluación psicológica', 75),
  ];
  const sum = (pick: (i: InvoiceItem) => number) => Math.round(items.reduce((acc, i) => acc + pick(i), 0) * 100) / 100;
  const subtotal = sum((i) => i.unit_price);
  const taxAmount = sum((i) => Number(i.tax_amount) || 0);
  const retentionAmount = sum((i) => Number(i.retention_amount) || 0);
  const today = new Date().toISOString().slice(0, 10);

  const sample = {
    id: 'preview',
    center_id: caller.centerId,
    invoice_number: 'MUESTRA-0001',
    invoice_type: 'complete',
    issue_date: today,
    due_date: null,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    retention_rate: retentionRate || null,
    retention_amount: retentionAmount || null,
    total: Math.round((subtotal + taxAmount - retentionAmount) * 100) / 100,
    notes: null,
    // Sin QR: la muestra no puede decir que está registrada en Verifactu.
    verifactu_qr: null,
    verifactu_hash: null,
    verifactu_timestamp: null,
    verifactu_registration_id: null,
    is_recapitulative: false,
    rectified_invoice_id: null,
    rectification_type: null,
    verifactu_invoice_type: null,
    pdf_generated_at: null,
    recipient_snapshot: {
      name: 'Paciente de ejemplo',
      tax_id: '00000000T',
      address: 'Calle de ejemplo, 1',
      city: 'Madrid',
      postal_code: '28001',
    },
    series_id: null,
    patients: { first_name: 'Paciente', last_name: 'de ejemplo', tax_id: null, address: null, city: null, postal_code: null, email: null },
    centers: center,
  } as InvoiceData;

  const pdfBytes = center.invoice_template === 'formal'
    ? await renderFormalInvoice(supabase, sample, items, null, [], null)
    : await generateInvoicePdfBytes(sample, items, null, [], null);

  const watermarked = await watermarkAsSample(pdfBytes);

  return new Response(
    JSON.stringify({ pdf_base64: encodeBase64(watermarked.slice().buffer) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (body?.preview === true) {
      const previewClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      return await handlePreview(req, body, previewClient, corsHeaders);
    }

    const invoice_id = body.invoice_id || body.invoiceId;
    const access_token = body.access_token;

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
        centers (${CENTER_PDF_COLUMNS})
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
    const hasValidAccessToken = typeof access_token === "string"
      && access_token.length > 0
      && access_token === invoiceAccessToken;

    if (!hasValidAccessToken) {
      const caller = await resolveCaller(req, supabase);
      if (!caller) return callerErrorResponse(401, corsHeaders);

      if (caller.kind === "user") {
        if (!canActOnCenter(caller, invoice.center_id)) {
          return callerErrorResponse(403, corsHeaders);
        }

        const { data: authorizedRole, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", caller.userId)
          .eq("center_id", caller.centerId)
          .in("role", ["admin", "professional"])
          .limit(1)
          .maybeSingle();

        if (roleError || !authorizedRole) {
          if (roleError) console.error("Invoice authorization role fetch error:", roleError);
          return callerErrorResponse(403, corsHeaders);
        }
      }
    }

    const invoiceData = invoice as InvoiceData;
    const filePath = `${invoiceData.center_id}/${invoice_id}.pdf`;

    // Invoices are legally immutable once issued: if the PDF was already
    // generated, reuse it instead of re-rendering. Only issue a fresh
    // signed URL (private bucket, so URLs expire).
    if (invoiceData.pdf_generated_at) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("invoice-documents")
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

      if (!signedUrlError && signedUrlData?.signedUrl) {
        // Best-effort backfill: if this invoice predates the Drive
        // connection, this picks it up on its next download. Cheap no-op
        // (single DB read) once drive_file_id is already set.
        try {
          const driveResponse = await fetch(`${supabaseUrl}/functions/v1/upload-invoice-to-drive`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ invoice_id }),
          });
          if (!driveResponse.ok) {
            console.error("[generate-invoice-pdf] Drive upload call failed:", await driveResponse.text());
          }
        } catch (driveError) {
          console.error("[generate-invoice-pdf] Drive upload call error:", driveError);
        }

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

    const pdfBytes = invoiceData.centers?.invoice_template === 'formal'
      ? await renderFormalInvoice(supabase, invoiceData, invoiceItems, rectifiedInvoice, substitutedInvoices, series)
      : await generateInvoicePdfBytes(invoiceData, invoiceItems, rectifiedInvoice, substitutedInvoices, series);

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
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

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

    // Best-effort external backup copy in the center's Google Drive, if
    // connected. Never blocks or fails the invoice download on error.
    try {
      const driveResponse = await fetch(`${supabaseUrl}/functions/v1/upload-invoice-to-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ invoice_id }),
      });
      if (!driveResponse.ok) {
        console.error("[generate-invoice-pdf] Drive upload call failed:", await driveResponse.text());
      }
    } catch (driveError) {
      console.error("[generate-invoice-pdf] Drive upload call error:", driveError);
    }

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

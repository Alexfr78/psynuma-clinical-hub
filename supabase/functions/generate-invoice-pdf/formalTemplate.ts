/**
 * Modelo de factura "formal" (centers.invoice_template = 'formal').
 *
 * Reproduce el formato de profesional colegiado: datos del emisor arriba a la
 * izquierda, banda con el tipo de documento, tabla con bordes, cuadro de
 * totales con "EXENTO*", firma, forma de pago y pie con teléfono, correo y
 * cláusula de protección de datos. Los importes van en formato español
 * ("1.234,56 €").
 *
 * Solo dibuja; las consultas y el cálculo de flags viven en index.ts.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { sanitizeForPdf, wrapText } from "../_shared/pdfHelpers.ts";

export interface FormalInvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_amount: number | null;
  tax_rate: number | null;
  retention_amount: number | null;
  retention_rate: number | null;
  total: number;
}

export interface FormalRecipient {
  name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export interface FormalInvoiceInput {
  documentLabel: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  total: number;
  /** IVA y retención de la cabecera; mandan si las líneas no los traen (p. ej. recapitulativas). */
  headerTax: { rate: number; amount: number };
  headerRetention: { rate: number; amount: number };
  notes: string | null;
  /** null en facturas simplificadas: no identifican al destinatario. */
  recipient: FormalRecipient | null;
  /** Avisos de rectificación / sustitución, ya redactados. */
  notices: string[];
  items: FormalInvoiceItem[];
  center: {
    name: string;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    phone: string | null;
    email: string | null;
    license_line: string | null;
    bank_transfer_info: string | null;
    tax_exemption_note: string | null;
    footer: string | null;
    data_protection_text: string | null;
  };
  logo: PDFImage | null;
  signature: PDFImage | null;
  qrImage: PDFImage | null;
}

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN_X = 50;
const TABLE_LEFT = 60;
const TABLE_RIGHT = 535;

const BAR = rgb(0.69, 0.753, 0.788); // #b0c0c9
const BAND = rgb(0.624, 0.788, 0.922); // #9fc9eb
const CELL_BG = rgb(0.949, 0.949, 0.949); // #f2f2f2
const CELL_BORDER = rgb(0.651, 0.651, 0.651); // #a6a6a6
const LABEL = rgb(0.498, 0.498, 0.498); // #7f7f7f
const BODY = rgb(0, 0, 0);
const DESC = rgb(0.129, 0.145, 0.161); // #212529
const WHITE = rgb(1, 1, 1);

/** 1234.5 -> "1.234,50 €". Se dibuja sin pasar por sanitizeForPdf (que cambia € por EUR). */
export function formatEuroEs(amount: number): string {
  const fixed = (Math.round((Number(amount) || 0) * 100) / 100).toFixed(2);
  const negative = fixed.startsWith("-");
  const [int, dec] = (negative ? fixed.slice(1) : fixed).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped},${dec} €`;
}

/** "2026-09-01" (o ISO completo) -> "01-09-2026", sin pasar por Date para no mover el día por zona horaria. */
export function formatDateEs(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function formatPercent(rate: number): string {
  return `${String(Number(rate)).replace(".", ",")}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Base imponible de una línea: cantidad × precio unitario (unit_price es sin IVA). */
export function lineBase(item: FormalInvoiceItem): number {
  return round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0));
}

export interface TaxGroup {
  rate: number;
  base: number;
  amount: number;
}

/**
 * Agrupa las líneas por tipo de IVA (0 = exenta) y por tipo de retención.
 * Ordena de mayor a menor tipo para que el desglose salga estable.
 */
export function buildTaxBreakdown(items: FormalInvoiceItem[]): { tax: TaxGroup[]; retention: TaxGroup[] } {
  const tax = new Map<number, TaxGroup>();
  const retention = new Map<number, TaxGroup>();
  for (const item of items) {
    const base = lineBase(item);
    const taxRate = Number(item.tax_rate) || 0;
    const t = tax.get(taxRate) ?? { rate: taxRate, base: 0, amount: 0 };
    t.base = round2(t.base + base);
    t.amount = round2(t.amount + (Number(item.tax_amount) || 0));
    tax.set(taxRate, t);

    const retentionRate = Number(item.retention_rate) || 0;
    const retentionAmount = Number(item.retention_amount) || 0;
    if (retentionRate > 0 || retentionAmount > 0) {
      const r = retention.get(retentionRate) ?? { rate: retentionRate, base: 0, amount: 0 };
      r.base = round2(r.base + base);
      r.amount = round2(r.amount + retentionAmount);
      retention.set(retentionRate, r);
    }
  }
  const byRateDesc = (a: TaxGroup, b: TaxGroup) => b.rate - a.rate;
  return { tax: [...tax.values()].sort(byRateDesc), retention: [...retention.values()].sort(byRateDesc) };
}

/**
 * Algunas facturas guardan el impuesto solo en la cabecera (las recapitulativas
 * crean las líneas sin tax_rate/tax_amount). Si la cabecera trae importe y la
 * suma de las líneas no cuadra con él, se usa la cabecera como un único tipo
 * sobre el subtotal, para no imprimir nunca "EXENTO" en una factura con IVA.
 */
export function reconcileWithHeader(
  breakdown: { tax: TaxGroup[]; retention: TaxGroup[] },
  input: Pick<FormalInvoiceInput, "subtotal" | "headerTax" | "headerRetention">,
): { tax: TaxGroup[]; retention: TaxGroup[] } {
  const sum = (groups: TaxGroup[]) => round2(groups.reduce((acc, g) => acc + g.amount, 0));
  const headerTaxAmount = round2(Number(input.headerTax.amount) || 0);
  const headerRetentionAmount = round2(Number(input.headerRetention.amount) || 0);
  // La cabecera solo manda cuando trae importe: si viene a 0/null y las líneas
  // sí llevan impuesto, el desglose de las líneas es el bueno.
  const useHeader = (lines: TaxGroup[], headerAmount: number) =>
    headerAmount !== 0 && Math.abs(sum(lines) - headerAmount) > 0.01;
  const tax = useHeader(breakdown.tax, headerTaxAmount)
    ? [{ rate: Number(input.headerTax.rate) || 0, base: round2(input.subtotal), amount: headerTaxAmount }]
    : breakdown.tax;
  const retention = useHeader(breakdown.retention, headerRetentionAmount)
    ? [{ rate: Number(input.headerRetention.rate) || 0, base: round2(input.subtotal), amount: headerRetentionAmount }]
    : breakdown.retention;
  return { tax, retention };
}

/** "FACTURA RECTIFICATIVA (Por diferencias)" -> "Factura rectificativa (por diferencias)". */
function toSentenceCase(label: string): string {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export async function generateFormalInvoicePdfBytes(
  pdfDoc: PDFDocument,
  input: FormalInvoiceInput,
): Promise<Uint8Array> {
  const [pageWidth, pageHeight] = PAGE_SIZE;
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const boldOblique = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const { center } = input;
  const s = (text: string | null | undefined) => sanitizeForPdf(text ?? "");

  // ---- Pie (se dibuja en todas las páginas al final) ----
  const protectionLines = center.data_protection_text
    ? wrapText(s(center.data_protection_text), serifItalic, 5.5, pageWidth - 72)
    : [];
  const footerNoteLines = center.footer ? wrapText(s(center.footer), oblique, 7.5, TABLE_RIGHT - TABLE_LEFT) : [];
  const hasContactBar = !!(center.phone || center.email);
  const protectionHeight = protectionLines.length * 6.5;
  const contactHeight = hasContactBar ? 44 : 0;
  const footerNoteHeight = footerNoteLines.length ? footerNoteLines.length * 10 + 6 : 0;
  // Coordenada Y por debajo de la cual el contenido no puede bajar.
  const contentBottom = 28 + protectionHeight + (protectionLines.length ? 10 : 0) + contactHeight + footerNoteHeight + 12;

  const drawFooter = (page: PDFPage) => {
    let y = 28 + protectionHeight;
    for (const line of protectionLines) {
      page.drawText(line, { x: 36, y, size: 5.5, font: serifItalic, color: BODY });
      y -= 6.5;
    }
    let top = 28 + protectionHeight + (protectionLines.length ? 10 : 0);
    if (hasContactBar) {
      const barY = top;
      page.drawRectangle({ x: TABLE_LEFT, y: barY, width: TABLE_RIGHT - TABLE_LEFT, height: 20, color: BAR });
      if (center.phone) {
        page.drawText(s(center.phone), { x: TABLE_LEFT + 6, y: barY + 7, size: 8, font: oblique, color: WHITE });
        page.drawText("TELÉFONO:", { x: TABLE_LEFT + 6, y: barY + 28, size: 8, font: oblique, color: BAR });
      }
      if (center.email) {
        const email = s(center.email);
        page.drawText(email, {
          x: TABLE_RIGHT - 6 - oblique.widthOfTextAtSize(email, 8), y: barY + 7, size: 8, font: oblique, color: WHITE,
        });
        const label = "CORREO ELECTRÓNICO";
        page.drawText(label, {
          x: TABLE_RIGHT - 6 - oblique.widthOfTextAtSize(label, 8), y: barY + 28, size: 8, font: oblique, color: BAR,
        });
      }
      top += contactHeight;
    }
    let noteY = top + footerNoteLines.length * 10 - 4;
    for (const line of footerNoteLines) {
      const w = oblique.widthOfTextAtSize(line, 7.5);
      page.drawText(line, { x: (pageWidth - w) / 2, y: noteY, size: 7.5, font: oblique, color: LABEL });
      noteY -= 10;
    }
  };

  const pages: PDFPage[] = [pdfDoc.addPage(PAGE_SIZE)];
  let page = pages[0];
  let y = pageHeight - 50;
  const newPage = () => {
    page = pdfDoc.addPage(PAGE_SIZE);
    pages.push(page);
    y = pageHeight - 50;
  };
  const ensureSpace = (height: number) => {
    if (y - height < contentBottom) newPage();
  };

  // ---- Emisor ----
  if (input.logo) {
    const scale = Math.min(140 / input.logo.width, 56 / input.logo.height, 1);
    const w = input.logo.width * scale;
    const h = input.logo.height * scale;
    page.drawImage(input.logo, { x: TABLE_RIGHT - w, y: y + 10 - h, width: w, height: h });
  }
  page.drawText(s(center.name).toUpperCase(), { x: MARGIN_X, y, size: 12, font: oblique, color: BODY });
  y -= 14;
  const addressLine = [center.address, [center.postal_code, center.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(". ");
  const issuerLines = [
    center.tax_id ? `NIF: ${center.tax_id}` : null,
    addressLine ? addressLine.toUpperCase() : null,
    center.license_line || null,
  ].filter(Boolean) as string[];
  for (const line of issuerLines) {
    page.drawText(s(line), { x: MARGIN_X, y, size: 10, font: oblique, color: BODY });
    y -= 12;
  }
  y -= 2;
  page.drawRectangle({ x: MARGIN_X, y: y - 20, width: TABLE_RIGHT - MARGIN_X, height: 20, color: BAR });
  y -= 44;

  // ---- Banda con el tipo de documento ----
  const title = s(toSentenceCase(input.documentLabel));
  page.drawRectangle({ x: 48, y: y - 32, width: TABLE_RIGHT - 48 + 2, height: 32, color: BAND });
  page.drawText(title, {
    x: (48 + TABLE_RIGHT + 2) / 2 - oblique.widthOfTextAtSize(title, 16) / 2, y: y - 22, size: 16, font: oblique, color: WHITE,
  });
  y -= 46;

  page.drawText(s(`NÚMERO DE FACTURA: ${input.invoiceNumber}`), { x: MARGIN_X, y, size: 10, font: boldOblique, color: LABEL });
  const dateText = `Fecha: ${formatDateEs(input.issueDate)}`;
  page.drawText(dateText, { x: TABLE_RIGHT - 30 - boldOblique.widthOfTextAtSize(dateText, 10), y, size: 10, font: boldOblique, color: LABEL });
  if (input.dueDate) {
    const dueText = `Vencimiento: ${formatDateEs(input.dueDate)}`;
    page.drawText(dueText, {
      x: TABLE_RIGHT - 30 - boldOblique.widthOfTextAtSize(dueText, 10), y: y - 13, size: 10, font: boldOblique, color: LABEL,
    });
  }
  y -= 22;

  // ---- Destinatario ----
  if (input.recipient) {
    const r = input.recipient;
    const drawLabelled = (label: string, value: string, valueFont: PDFFont) => {
      page.drawText(label, { x: MARGIN_X, y, size: 10, font: regular, color: BODY });
      const lines = wrapText(s(value), valueFont, 10, TABLE_RIGHT - MARGIN_X - regular.widthOfTextAtSize(label, 10));
      lines.forEach((line, i) => {
        page.drawText(line, { x: MARGIN_X + regular.widthOfTextAtSize(label, 10), y: y - i * 13, size: 10, font: valueFont, color: BODY });
      });
      y -= Math.max(lines.length, 1) * 13 + 8;
    };
    drawLabelled("Cliente: ", r.name || "Cliente", oblique);
    if (r.tax_id) drawLabelled("NIF: ", r.tax_id, regular);
    const recipientAddress = [r.address, [r.postal_code, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (recipientAddress) drawLabelled("Domicilio: ", recipientAddress, regular);
  }

  // ---- Avisos de rectificación / sustitución ----
  for (const notice of input.notices) {
    const lines = wrapText(s(notice), oblique, 9, TABLE_RIGHT - TABLE_LEFT - 16);
    const h = lines.length * 12 + 10;
    page.drawRectangle({
      x: TABLE_LEFT, y: y - h, width: TABLE_RIGHT - TABLE_LEFT, height: h, color: CELL_BG, borderColor: CELL_BORDER, borderWidth: 0.5,
    });
    lines.forEach((line, i) => {
      page.drawText(line, { x: TABLE_LEFT + 8, y: y - 14 - i * 12, size: 9, font: oblique, color: BODY });
    });
    y -= h + 8;
  }
  y -= 22;

  // ---- Tabla de conceptos ----
  const cols = [
    { x: TABLE_LEFT, w: 72 },
    { x: TABLE_LEFT + 72, w: 253 },
    { x: TABLE_LEFT + 325, w: 80 },
    { x: TABLE_LEFT + 405, w: TABLE_RIGHT - TABLE_LEFT - 405 },
  ];
  const cellBox = (x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>) => {
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: CELL_BORDER, borderWidth: 0.5 });
  };
  const centered = (text: string, col: { x: number; w: number }, baseline: number, font: PDFFont, size: number, color = BODY) => {
    page.drawText(text, { x: col.x + col.w / 2 - font.widthOfTextAtSize(text, size) / 2, y: baseline, size, font, color });
  };

  const headerTitles = ["Cantidad", "Descripción", "Precio por unidad", "Total"];
  const headerLines = headerTitles.map((t, i) => wrapText(t, oblique, 9, cols[i].w - 24));
  const headerHeight = Math.max(...headerLines.map((l) => l.length)) * 11 + 12;
  const drawTableHeader = () => {
    headerLines.forEach((lines, i) => {
      cellBox(cols[i].x, y, cols[i].w, headerHeight, CELL_BG);
      lines.forEach((line, li) => centered(line, cols[i], y - 14 - li * 11, oblique, 9, LABEL));
    });
    y -= headerHeight;
  };

  ensureSpace(headerHeight + 30);
  drawTableHeader();

  for (const item of input.items) {
    const descLines = wrapText(s(item.description || ""), serifItalic, 10.5, cols[1].w - 12);
    const rowHeight = Math.max(descLines.length, 1) * 13 + 14;
    if (y - rowHeight < contentBottom) {
      newPage();
      drawTableHeader();
    }
    cols.forEach((c) => cellBox(c.x, y, c.w, rowHeight));
    centered(String(Number(item.quantity) || 0).replace(".", ","), cols[0], y - 14, oblique, 9);
    descLines.forEach((line, i) => {
      page.drawText(line, { x: cols[1].x + 6, y: y - 14 - i * 13, size: 10.5, font: serifItalic, color: DESC });
    });
    centered(formatEuroEs(item.unit_price), cols[2], y - 14, oblique, 9);
    // item.total incluye el IVA; aquí va la base de la línea y el IVA se desglosa en los totales.
    centered(formatEuroEs(lineBase(item)), cols[3], y - 14, oblique, 9);
    y -= rowHeight;
  }
  y -= 24;

  // ---- Totales ----
  // Desglose por tipo (RD 1619/2012, art. 6.1): base y cuota por cada tipo de
  // IVA, y la base exenta aparte con su nota legal.
  const breakdown = reconcileWithHeader(buildTaxBreakdown(input.items), input);
  const exemptGroup = breakdown.tax.find((g) => g.rate === 0) ?? null;
  const taxedGroups = breakdown.tax.filter((g) => g.rate > 0);
  const exemptionNote = exemptGroup ? (center.tax_exemption_note || "").trim() : "";
  const exemptMark = exemptionNote ? "*" : "";
  const mixedTax = breakdown.tax.length > 1;

  const totalsRows: { label: string; value: string; bold?: boolean }[] = [
    { label: "Subtotal:", value: formatEuroEs(input.subtotal) },
  ];
  if (!mixedTax && exemptGroup) {
    totalsRows.push({ label: "IVA:", value: `EXENTO${exemptMark}` });
  } else if (!mixedTax && taxedGroups.length === 1) {
    totalsRows.push({ label: `IVA ${formatPercent(taxedGroups[0].rate)}:`, value: formatEuroEs(taxedGroups[0].amount) });
  } else {
    for (const g of taxedGroups) {
      totalsRows.push({ label: `Base IVA ${formatPercent(g.rate)}:`, value: formatEuroEs(g.base) });
      totalsRows.push({ label: `IVA ${formatPercent(g.rate)}:`, value: formatEuroEs(g.amount) });
    }
    if (exemptGroup) {
      totalsRows.push({ label: `Base exenta${exemptMark}:`, value: formatEuroEs(exemptGroup.base) });
      totalsRows.push({ label: "IVA:", value: `EXENTO${exemptMark}` });
    }
  }
  for (const g of breakdown.retention) {
    totalsRows.push({
      label: g.rate > 0
        ? (breakdown.retention.length > 1 ? `I.R.P.F. ${formatPercent(g.rate)} s/ ${formatEuroEs(g.base)}:` : `I.R.P.F. ${formatPercent(g.rate)}:`)
        : "I.R.P.F.:",
      value: formatEuroEs(g.amount),
    });
  }
  totalsRows.push({ label: "TOTAL:", value: formatEuroEs(input.total), bold: true });

  const totalsLabelCol = { x: 315, w: 125 };
  const totalsValueCol = { x: 440, w: TABLE_RIGHT - 440 };
  const totalsRowHeight = 17.5;
  ensureSpace(totalsRows.length * totalsRowHeight + 10);
  for (const row of totalsRows) {
    const font = row.bold ? boldOblique : oblique;
    const size = row.bold ? 10 : 9;
    cellBox(totalsLabelCol.x, y, totalsLabelCol.w, totalsRowHeight, CELL_BG);
    cellBox(totalsValueCol.x, y, totalsValueCol.w, totalsRowHeight, row.bold ? CELL_BG : undefined);
    page.drawText(row.label, {
      x: totalsLabelCol.x + totalsLabelCol.w - 10 - font.widthOfTextAtSize(row.label, size), y: y - 12, size, font, color: LABEL,
    });
    centered(row.value, totalsValueCol, y - 12, font, size);
    y -= totalsRowHeight;
  }
  y -= 16;

  // ---- Firma ----
  if (input.signature) {
    const scale = Math.min(150 / input.signature.width, 80 / input.signature.height, 1);
    const w = input.signature.width * scale;
    const h = input.signature.height * scale;
    ensureSpace(h + 10);
    page.drawImage(input.signature, { x: TABLE_RIGHT - 10 - w, y: y - h, width: w, height: h });
    y -= h + 16;
  } else {
    y -= 20;
  }

  // ---- Forma de pago ----
  const payBox = { x: TABLE_LEFT, w: 290 };
  const transferLines = center.bank_transfer_info
    ? s(center.bank_transfer_info).split("\n").map((l) => l.trim()).filter(Boolean)
    : [];
  if (transferLines.length) {
    const prefix = "TRANSFERENCIA: ";
    const prefixW = oblique.widthOfTextAtSize(prefix, 9);
    const valueLines = transferLines.flatMap((l) => wrapText(l, boldOblique, 9, payBox.w - 24 - prefixW));
    const bodyHeight = valueLines.length * 12 + 9;
    ensureSpace(17 + bodyHeight + 30);
    cellBox(payBox.x, y, payBox.w, 17, CELL_BG);
    const payLabel = "FORMA DE PAGO:";
    page.drawText(payLabel, { x: payBox.x + payBox.w - 30 - oblique.widthOfTextAtSize(payLabel, 9), y: y - 12, size: 9, font: oblique, color: LABEL });
    y -= 17;
    cellBox(payBox.x, y, payBox.w, bodyHeight, CELL_BG);
    page.drawText(prefix, { x: payBox.x + 18, y: y - 12, size: 9, font: oblique, color: LABEL });
    valueLines.forEach((line, i) => {
      page.drawText(line, { x: payBox.x + 18 + prefixW, y: y - 12 - i * 12, size: 9, font: boldOblique, color: LABEL });
    });
    y -= bodyHeight + 4;
  }

  if (exemptionNote) {
    const noteLines = wrapText(s(`* ${exemptionNote}`), boldOblique, 9, TABLE_RIGHT - TABLE_LEFT);
    ensureSpace(noteLines.length * 11 + 4);
    noteLines.forEach((line) => {
      y -= 11;
      page.drawText(line, { x: TABLE_LEFT, y, size: 9, font: boldOblique, color: LABEL });
    });
    y -= 6;
  }

  // ---- Observaciones ----
  if (input.notes) {
    y -= 10;
    const noteLines = wrapText(s(input.notes), oblique, 9, TABLE_RIGHT - TABLE_LEFT);
    ensureSpace(14);
    page.drawText("Observaciones:", { x: TABLE_LEFT, y, size: 9, font: boldOblique, color: LABEL });
    y -= 12;
    for (const line of noteLines) {
      ensureSpace(12);
      page.drawText(line, { x: TABLE_LEFT, y, size: 9, font: oblique, color: LABEL });
      y -= 12;
    }
  }

  // ---- Código QR Verifactu ----
  if (input.qrImage) {
    y -= 12;
    // 90 pt ≈ 32 mm, igual que el modelo estándar (la norma pide entre 30 y 40 mm).
    ensureSpace(98);
    page.drawImage(input.qrImage, { x: TABLE_LEFT, y: y - 90, width: 90, height: 90 });
    page.drawText("Factura registrada en Verifactu", { x: TABLE_LEFT + 102, y: y - 18, size: 9, font: boldOblique, color: LABEL });
    const qrLines = wrapText(
      "Puede verificar la autenticidad de esta factura escaneando el código QR",
      oblique, 8, TABLE_RIGHT - TABLE_LEFT - 110,
    );
    qrLines.forEach((line, i) => {
      page.drawText(line, { x: TABLE_LEFT + 102, y: y - 32 - i * 10, size: 8, font: oblique, color: LABEL });
    });
    y -= 98;
  }

  for (const p of pages) drawFooter(p);

  return await pdfDoc.save();
}

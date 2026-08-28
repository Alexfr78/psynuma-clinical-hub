/**
 * Shared pdf-lib drawing helpers for server-generated PDFs (invoices, consents).
 */
import { PDFDocument, PDFFont, PDFPage, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// Sanitize text for WinAnsi encoding (StandardFonts compatibility)
export function sanitizeForPdf(text: string): string {
  return text
    // Remove zero-width and invisible Unicode characters
    .replace(/‍/g, '')
    .replace(/[​‌‎‏﻿­  ‪- ⁠-⁯]/g, '')
    // Replace common Unicode symbols with ASCII equivalents
    .replace(/✓/g, '[X]')
    .replace(/✗/g, '[ ]')
    .replace(/•/g, '-')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/€/g, 'EUR')
    .replace(/©/g, '(c)')
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    // Spanish characters are supported in WinAnsi, but let's be safe
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

export function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
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

export function drawTextWithPageBreaks(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  text: string,
  font: PDFFont,
  fontSize: number,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  pageSize: [number, number],
  marginBottom: number
): { currentPage: PDFPage; currentY: number; pages: PDFPage[] } {
  const [pageWidth, pageHeight] = pageSize;
  const lines = wrapText(text, font, fontSize, maxWidth);
  let currentY = startY;
  let currentPage = pages[pages.length - 1];

  for (const line of lines) {
    if (currentY < marginBottom) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
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

// Right-align a line of text at x = rightEdge - textWidth
export function drawTextRightAligned(
  page: PDFPage,
  text: string,
  rightEdge: number,
  y: number,
  size: number,
  font: PDFFont,
  color = rgb(0.12, 0.15, 0.21)
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightEdge - width, y, size, font, color });
}

export async function embedImageFromUrl(
  pdfDoc: PDFDocument,
  url: string
): Promise<Awaited<ReturnType<PDFDocument['embedPng']>> | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  } catch (error) {
    console.error('[pdfHelpers] Error embedding image from URL:', error);
    return null;
  }
}

/**
 * Colores configurables de la factura (centers.invoice_primary_color /
 * invoice_secondary_color). Un color mal elegido no puede dejar el documento
 * ilegible: el texto de color se oscurece hasta tener contraste suficiente
 * sobre blanco, y sobre fondos de color se elige texto blanco u oscuro.
 */
import { rgb, type RGB } from "https://esm.sh/pdf-lib@1.17.1";

export type Rgb = [number, number, number]; // 0..1

const HEX = /^#[0-9a-f]{6}$/;

export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  if (!HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim().toLowerCase());
}

function channel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Oscurece el color hasta alcanzar `minRatio` de contraste sobre blanco. */
export function readableOnWhite(color: Rgb, minRatio = 4.5): Rgb {
  let c = color;
  for (let i = 0; i < 20 && contrast(c, [1, 1, 1]) < minRatio; i++) {
    c = c.map((v) => v * 0.9) as Rgb;
  }
  return c;
}

/** Texto blanco u oscuro, el que mejor se lea sobre `background`. */
export function textOn(background: Rgb): Rgb {
  const dark: Rgb = [0.06, 0.09, 0.16];
  return contrast([1, 1, 1], background) >= contrast(dark, background) ? [1, 1, 1] : dark;
}

export function darken(color: Rgb, factor = 0.78): Rgb {
  return color.map((v) => v * factor) as Rgb;
}

export function toPdf([r, g, b]: Rgb): RGB {
  return rgb(r, g, b);
}

// Representación de la EAS como en la hoja: tres ejes desde el centro
// (Intimidad arriba, Pasión abajo a la izquierda, Compromiso abajo a la derecha)
// con una marca cada 5 puntos, y el triángulo de cada serie uniendo sus tres
// puntuaciones. Una serie por persona, para superponer a los dos miembros.
// Devuelve un SVG en texto para la web y el PDF.

import { EAS_COMPONENT_MAX, type EASComponent } from './easScoring.ts';

export interface EASTriangleColors {
  text: string;
  muted: string;
  axis: string;
  grid: string;
  surface: string;
  first: string;
  second: string;
}

export interface EASTriangleSeries {
  label: string;
  scores: Record<string, number>;
  color: string;
  dash: string;
}

export const EAS_TRIANGLE_PRINT_COLORS: EASTriangleColors = {
  text: '#111827',
  muted: '#6b7280',
  axis: '#374151',
  grid: '#e5e7eb',
  surface: '#ffffff',
  first: '#1e3a8a',
  second: '#ea580c',
};

export const EAS_SERIES_DASH = ['', '7 3 2 3'];

const AXES: { code: EASComponent; label: string; angle: number }[] = [
  { code: 'INT', label: 'Intimidad', angle: -90 },
  { code: 'COM', label: 'Compromiso', angle: 30 },
  { code: 'PAS', label: 'Pasión', angle: 150 },
];

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderEASTriangleSvg(
  series: EASTriangleSeries[],
  colors: EASTriangleColors = EAS_TRIANGLE_PRINT_COLORS,
): string {
  const width = 480;
  const cx = 240;
  const cy = 200;
  const radius = 150;
  const legendY = 368;
  const height = legendY + 14;
  const font = 'font-family="Arial, Helvetica, sans-serif"';
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const point = (angle: number, value: number) => {
    const r = (Math.max(0, Math.min(EAS_COMPONENT_MAX, value)) / EAS_COMPONENT_MAX) * radius;
    return { x: cx + r * Math.cos(rad(angle)), y: cy + r * Math.sin(rad(angle)) };
  };
  const fmt = (n: number) => n.toFixed(1);
  const parts: string[] = [];

  // Triángulos de referencia cada 45 puntos
  for (const level of [45, 90, 135]) {
    const pts = AXES.map(a => point(a.angle, level));
    parts.push(`<polygon points="${pts.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}" fill="none" stroke="${colors.grid}" stroke-width="1"/>`);
  }

  // Ejes con una marca cada 5 puntos (más larga cada 15)
  for (const axis of AXES) {
    const end = point(axis.angle, EAS_COMPONENT_MAX);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" stroke="${colors.axis}" stroke-width="1.2"/>`);
    const perp = rad(axis.angle + 90);
    for (let v = 5; v <= EAS_COMPONENT_MAX; v += 5) {
      const p = point(axis.angle, v);
      const half = v % 15 === 0 ? 5 : 3;
      const dx = half * Math.cos(perp);
      const dy = half * Math.sin(perp);
      parts.push(`<line x1="${fmt(p.x - dx)}" y1="${fmt(p.y - dy)}" x2="${fmt(p.x + dx)}" y2="${fmt(p.y + dy)}" stroke="${colors.axis}" stroke-width="0.8"/>`);
    }
 // Nombre del eje más allá del extremo, lejos de los valores (que van junto a su punto)
    const out = 20;
    const lx = end.x + out * Math.cos(rad(axis.angle));
    const ly = end.y + out * Math.sin(rad(axis.angle));
    const anchor = axis.angle === -90 ? 'middle' : axis.angle === 30 ? 'start' : 'end';
    const dyLabel = axis.angle === -90 ? 0 : 18;
    parts.push(`<text x="${fmt(lx)}" y="${fmt(ly + dyLabel)}" font-size="13" font-weight="bold" font-style="italic" text-anchor="${anchor}" fill="${colors.text}" ${font}>${axis.label}</text>`);
  }

  // Escala numérica sobre el eje de Intimidad
  for (const level of [45, 90, 135]) {
    const p = point(-90, level);
    parts.push(`<text x="${fmt(p.x + 9)}" y="${fmt(p.y + 3)}" font-size="9" fill="${colors.muted}" ${font}>${level}</text>`);
  }

  // Triángulo de cada serie; con una sola serie se rotulan los valores
  series.forEach((serie, idx) => {
    const pts = AXES.map(a => ({ axis: a, value: serie.scores[a.code], ...point(a.angle, serie.scores[a.code] ?? 0) }));
    if (pts.some(p => typeof p.value !== 'number')) return;
    const dash = serie.dash ? ` stroke-dasharray="${serie.dash}"` : '';
    parts.push(`<polygon points="${pts.map(p => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}" fill="${serie.color}" fill-opacity="${idx === 0 ? 0.14 : 0.08}" stroke="${serie.color}" stroke-width="2"${dash}/>`);
    for (const p of pts) {
      parts.push(`<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="4.5" fill="${serie.color}" stroke="${colors.surface}" stroke-width="2"/>`);
 if (series.length === 1) {
        // Intimidad: a la derecha del punto; Pasión y Compromiso: debajo y hacia
        // dentro, donde no pasan ni el borde del triángulo ni el eje
        const isTop = p.axis.angle === -90;
        const vx = isTop ? p.x + 10 : p.x + (p.axis.angle === 30 ? -6 : 6);
        const vy = isTop ? p.y + 4 : p.y + 18;
        const anchor = isTop ? 'start' : p.axis.angle === 30 ? 'end' : 'start';
        parts.push(`<text x="${fmt(vx)}" y="${fmt(vy)}" font-size="11" font-weight="bold" text-anchor="${anchor}" fill="${colors.text}" ${font}>${p.value}</text>`);
      }
    }
  });

  // Leyenda
  let legendX = 20;
  for (const serie of series) {
    const dash = serie.dash ? ` stroke-dasharray="${serie.dash}"` : '';
    parts.push(`<line x1="${legendX}" x2="${legendX + 24}" y1="${legendY - 4}" y2="${legendY - 4}" stroke="${serie.color}" stroke-width="2"${dash}/>`);
    parts.push(`<text x="${legendX + 30}" y="${legendY}" font-size="11" fill="${colors.text}" ${font}>${escapeXml(serie.label)}</text>`);
    legendX += 30 + serie.label.length * 6 + 24;
  }

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width: ${width * 1.2}px; display: block; margin: 0 auto;" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Triángulo del amor de Sternberg">${parts.join('')}</svg>`;
}

// Hoja de perfil del DAS dibujada como en el cuadernillo: filas de T (80 a 20),
// cada escala con sus columnas General y Clínico llenas de puntuaciones directas,
// las celdas de cada serie marcadas y unidas por una línea, la franja media
// sombreada y las bandas de interpretación a la izquierda. Una serie es una
// persona con un baremo: un miembro con sus dos baremos, o los dos miembros de
// la pareja con el mismo. Devuelve un SVG en texto para la web y el PDF.

import { DAS_NORMS, type DASNorm, type DASScale } from './dasScoring.ts';

export interface DASProfileColors {
  text: string;
  muted: string;
  grid: string;
  gridStrong: string;
  headerFill: string;
  clinicalFill: string;
  medioFill: string;
  markFill: string;
  first: string;
  second: string;
}

export interface DASProfileSeries {
  label: string;
  scores: Record<string, number>;
  norm: DASNorm;
  color: string;
  dash: string;
}

export const DAS_SERIES_DASH = ['2 3', '7 3 2 3'];

export const DAS_PROFILE_PRINT_COLORS: DASProfileColors = {
  text: '#111827',
  muted: '#6b7280',
  grid: '#e5e7eb',
  gridStrong: '#9ca3af',
  headerFill: '#f3f4f6',
  clinicalFill: '#f3f4f6',
  medioFill: '#dbeafe',
  markFill: '#ffffff',
  first: '#1e3a8a',
  second: '#ea580c',
};

/** Un miembro con sus dos baremos: general y clínico. */
export function dasNormSeries(scores: Record<string, number>, colors: DASProfileColors): DASProfileSeries[] {
  return [
    { label: 'Baremo general', scores, norm: 'GEN', color: colors.first, dash: DAS_SERIES_DASH[0] },
    { label: 'Baremo clínico', scores, norm: 'CLIN', color: colors.second, dash: DAS_SERIES_DASH[1] },
  ];
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Bandas de la hoja: T 66-80 muy alto, 56-65 alto, 45-55 medio, 35-44 bajo, 20-34 muy bajo
export const DAS_T_BANDS = [
  { label: 'Muy alto', min: 66, max: 80 },
  { label: 'Alto', min: 56, max: 65 },
  { label: 'Medio', min: 45, max: 55 },
  { label: 'Bajo', min: 35, max: 44 },
  { label: 'Muy bajo', min: 20, max: 34 },
];

const SCALES: { code: DASScale; label: string[] }[] = [
  { code: 'CON', label: ['Consenso'] },
  { code: 'SAT', label: ['Satisfacción'] },
  { code: 'EXP', label: ['Expresión', 'afectiva'] },
  { code: 'COH', label: ['Cohesión'] },
  { code: 'TOTAL', label: ['Ajuste', 'diádico'] },
];
const NORMS: DASNorm[] = ['GEN', 'CLIN'];

function rangeLabel(scale: DASScale, norm: DASNorm, t: number): string {
  const row = DAS_NORMS[scale][norm].find(([rowT]) => rowT === t);
  if (!row) return '';
  const [, min, max] = row;
  return min === max ? String(min) : `${min}-${max}`;
}

export function renderDASProfileSvg(
  series: DASProfileSeries[],
  colors: DASProfileColors = DAS_PROFILE_PRINT_COLORS,
): string {
  const bandW = 62;
  const tColW = 26;
  const colW = 56;
  const rowH = 10;
  const headerH = 40;
  const legendH = 24;
  const tableX = bandW + tColW;
  const tableW = colW * SCALES.length * 2;
  const width = tableX + tableW + tColW;
  const rowsTop = headerH;
  const height = rowsTop + 61 * rowH + legendH;
  const rowY = (t: number) => rowsTop + (80 - t) * rowH;
  const colX = (scaleIdx: number, normIdx: number) => tableX + (scaleIdx * 2 + normIdx) * colW;

  const parts: string[] = [];
  const font = 'font-family="Arial, Helvetica, sans-serif"';

  // Franja media y columnas clínicas sombreadas
  parts.push(`<rect x="${tableX}" y="${rowY(55)}" width="${tableW}" height="${11 * rowH}" fill="${colors.medioFill}"/>`);
  SCALES.forEach((_, si) => {
    parts.push(`<rect x="${colX(si, 1)}" y="${rowsTop}" width="${colW}" height="${61 * rowH}" fill="${colors.clinicalFill}" fill-opacity="0.6"/>`);
  });

  // Cabecera
  parts.push(`<rect x="${tableX - tColW}" y="0" width="${tableW + 2 * tColW}" height="${headerH}" fill="${colors.headerFill}"/>`);
  SCALES.forEach((scale, si) => {
    const cx = colX(si, 0) + colW;
    scale.label.forEach((line, li) => {
      const y = scale.label.length === 1 ? 17 : 11 + li * 10;
      parts.push(`<text x="${cx}" y="${y}" font-size="9" font-weight="bold" text-anchor="middle" fill="${colors.text}" ${font}>${line}</text>`);
    });
    NORMS.forEach((_, ni) => {
      parts.push(`<text x="${colX(si, ni) + colW / 2}" y="${headerH - 6}" font-size="8" text-anchor="middle" fill="${colors.muted}" ${font}>${ni === 0 ? 'General' : 'Clínico'}</text>`);
    });
  });
  parts.push(`<text x="${tableX - tColW / 2}" y="${headerH - 6}" font-size="9" font-weight="bold" text-anchor="middle" fill="${colors.text}" ${font}>T</text>`);
  parts.push(`<text x="${tableX + tableW + tColW / 2}" y="${headerH - 6}" font-size="9" font-weight="bold" text-anchor="middle" fill="${colors.text}" ${font}>T</text>`);

  // Rejilla: línea fina en cada fila y marcada cada cinco puntos de T, como en la hoja
  // (grupos 80-76, 75-71, ..., 25-21 y la fila 20 sola)
  for (let t = 80; t >= 19; t--) {
    const strong = t === 80 || t === 19 || t % 5 === 0;
    parts.push(
      `<line x1="${tableX - tColW}" x2="${tableX + tableW + tColW}" y1="${rowY(t)}" y2="${rowY(t)}" ` +
      `stroke="${strong ? colors.gridStrong : colors.grid}" stroke-width="${strong ? 0.8 : 0.5}"/>`
    );
  }
  for (let c = 0; c <= SCALES.length * 2; c++) {
    const x = tableX + c * colW;
    const strong = c % 2 === 0;
    parts.push(`<line x1="${x}" x2="${x}" y1="${strong ? 0 : 22}" y2="${rowY(19)}" stroke="${strong ? colors.gridStrong : colors.grid}" stroke-width="${strong ? 0.8 : 0.5}"/>`);
  }
  parts.push(`<rect x="${tableX - tColW}" y="0" width="${tableW + 2 * tColW}" height="${rowY(19)}" fill="none" stroke="${colors.gridStrong}" stroke-width="0.8"/>`);

  // Líneas de cada serie y sus celdas marcadas, por debajo de los números. El
  // recuadro va relleno para que la línea no cruce la PD marcada, y el de la
  // segunda serie un poco más ajustado para distinguirlos si caen en la misma celda.
  const marked = new Set<string>();
  const lines: string[] = [];
  const marks: string[] = [];
  series.forEach((serie, idx) => {
    const ni = NORMS.indexOf(serie.norm);
    const points = SCALES
      .map((scale, si) => ({ si, t: serie.scores[`${scale.code}_T_${serie.norm}`] }))
      .filter(p => typeof p.t === 'number' && p.t >= 20 && p.t <= 80)
      .map(p => {
        marked.add(`${p.si}-${ni}-${p.t}`);
        return { x: colX(p.si, ni) + colW / 2, y: rowY(p.t) + rowH / 2 };
      });
    if (points.length === 0) return;
    const inset = idx === 0 ? 2 : 5;
    lines.push(`<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${serie.color}" stroke-width="1.8" stroke-dasharray="${serie.dash}"/>`);
    for (const p of points) {
      marks.push(`<rect x="${p.x - colW / 2 + inset}" y="${p.y - rowH / 2 + 0.5}" width="${colW - 2 * inset}" height="${rowH - 1}" rx="4.5" fill="${colors.markFill}" stroke="${serie.color}" stroke-width="1.5"/>`);
    }
  });
  parts.push(...lines, ...marks);

  // Columnas de T y valores de PD
  for (let t = 80; t >= 20; t--) {
    const y = rowY(t) + rowH - 2.5;
    parts.push(`<text x="${tableX - tColW / 2}" y="${y}" font-size="7.5" font-weight="bold" text-anchor="middle" fill="${colors.text}" ${font}>${t}</text>`);
    parts.push(`<text x="${tableX + tableW + tColW / 2}" y="${y}" font-size="7.5" font-weight="bold" text-anchor="middle" fill="${colors.text}" ${font}>${t}</text>`);
    SCALES.forEach((scale, si) => {
      NORMS.forEach((norm, ni) => {
        const label = rangeLabel(scale.code, norm, t);
        if (label) {
          const isMarked = marked.has(`${si}-${ni}-${t}`);
          parts.push(`<text x="${colX(si, ni) + colW / 2}" y="${y}" font-size="7" text-anchor="middle" fill="${isMarked ? colors.text : colors.muted}"${isMarked ? ' font-weight="bold"' : ''} ${font}>${label}</text>`);
        }
      });
    });
  }

  // Bandas de interpretación con su llave
  for (const band of DAS_T_BANDS) {
    const y1 = rowY(band.max) + 2;
    const y2 = rowY(band.min) + rowH - 2;
    const bx = bandW - 6;
    parts.push(`<path d="M ${bx + 4} ${y1} H ${bx} V ${y2} H ${bx + 4}" fill="none" stroke="${colors.muted}" stroke-width="1"/>`);
    parts.push(`<text x="${bx - 5}" y="${(y1 + y2) / 2 + 3}" font-size="9" text-anchor="end" fill="${colors.text}" ${font}>${band.label}</text>`);
  }

  // Leyenda
  const ly = rowY(19) + 16;
  let lx = tableX;
  for (const serie of series) {
    const label = escapeXml(serie.label);
    parts.push(`<line x1="${lx}" x2="${lx + 26}" y1="${ly - 3}" y2="${ly - 3}" stroke="${serie.color}" stroke-width="1.8" stroke-dasharray="${serie.dash}"/>`);
    parts.push(`<text x="${lx + 32}" y="${ly}" font-size="9" fill="${colors.text}" ${font}>${label}</text>`);
    lx += 32 + serie.label.length * 5 + 24;
  }
  parts.push(`<rect x="${lx}" y="${ly - 8}" width="14" height="9" fill="${colors.medioFill}"/>`);
  parts.push(`<text x="${lx + 20}" y="${ly}" font-size="9" fill="${colors.text}" ${font}>Rango medio (T 45-55)</text>`);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width: ${width * 1.15}px; display: block;" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hoja de perfil DAS">${parts.join('')}</svg>`;
}

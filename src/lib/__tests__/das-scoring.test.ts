import { describe, it, expect } from 'vitest';
import {
  DAS_NORMS,
  DAS_SCALE_ITEMS,
  DAS_SCALE_MAX,
  dasTScore,
  scoreDAS,
  type DASNorm,
  type DASScale,
} from '../../../supabase/functions/_shared/dasScoring';
import { getDASTemplateData } from '@/data/das-template';
import {
  renderDASProfileSvg,
  dasNormSeries,
  DAS_PROFILE_PRINT_COLORS,
} from '../../../supabase/functions/_shared/dasProfileSvg';

const SCALES: DASScale[] = ['CON', 'SAT', 'EXP', 'COH', 'TOTAL'];
const NORMS: DASNorm[] = ['GEN', 'CLIN'];

describe('DAS baremos', () => {
  for (const scale of SCALES) {
    for (const norm of NORMS) {
      it(`${scale}/${norm}: cada PD de 0 a ${DAS_SCALE_MAX[scale]} tiene exactamente una T`, () => {
        for (let raw = 0; raw <= DAS_SCALE_MAX[scale]; raw++) {
          const matches = DAS_NORMS[scale][norm].filter(([, min, max]) => raw >= min && raw <= max);
          expect(matches, `PD ${raw}`).toHaveLength(1);
        }
      });

      it(`${scale}/${norm}: la T no baja al subir la PD`, () => {
        let prev = 0;
        for (let raw = 0; raw <= DAS_SCALE_MAX[scale]; raw++) {
          const t = dasTScore(scale, norm, raw)!;
          expect(t).toBeGreaterThanOrEqual(prev);
          prev = t;
        }
      });
    }
  }

  it('conversiones puntuales del cuadernillo', () => {
    expect(dasTScore('TOTAL', 'GEN', 117)).toBe(50);
    expect(dasTScore('TOTAL', 'CLIN', 86)).toBe(50);
    expect(dasTScore('CON', 'CLIN', 35)).toBe(42);
    expect(dasTScore('SAT', 'CLIN', 9)).toBe(25);
    expect(dasTScore('COH', 'GEN', 1)).toBe(20);
  });
});

describe('DAS plantilla y puntuación', () => {
  const template = getDASTemplateData();

  it('tiene 32 ítems y cada uno pertenece a una sola escala', () => {
    expect(template.items).toHaveLength(32);
    const all = Object.values(DAS_SCALE_ITEMS).flat().sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it('el máximo de cada escala coincide con la suma de los máximos de sus ítems', () => {
    let total = 0;
    for (const [scale, items] of Object.entries(DAS_SCALE_ITEMS)) {
      const max = items.reduce((acc, index) => {
        const item = template.items.find(i => i.index === index)!;
        return acc + Math.max(...item.options.map(o => o.value));
      }, 0);
      expect(max, scale).toBe(DAS_SCALE_MAX[scale as DASScale]);
      total += max;
    }
    expect(total).toBe(DAS_SCALE_MAX.TOTAL);
  });

  it('respuestas máximas dan la puntuación máxima', () => {
    const answers: Record<string, number> = {};
    for (const item of template.items) {
      answers[item.index] = Math.max(...item.options.map(o => o.value));
    }
    const { factorScores, flags } = scoreDAS(answers);
    expect(factorScores).toMatchObject({
      CON: 65, SAT: 50, EXP: 12, COH: 24, TOTAL: 151,
      TOTAL_T_GEN: 80, TOTAL_T_CLIN: 80,
    });
    expect(flags).toEqual({});
  });

  it('respuestas mínimas marcan todas las escalas como bajas', () => {
    const answers: Record<string, string> = {};
    for (const item of template.items) answers[item.index] = '0';
    const { factorScores, flags } = scoreDAS(answers);
    expect(factorScores.TOTAL).toBe(0);
    expect(factorScores.TOTAL_T_GEN).toBe(20);
    expect(flags).toEqual({ CON_low: true, SAT_low: true, EXP_low: true, COH_low: true, TOTAL_low: true });
  });
});

describe('DAS hoja de perfil', () => {
  const scores = scoreDAS(
    Object.fromEntries(getDASTemplateData().items.map(item => [item.index, item.options[1].value])),
  ).factorScores;

  it('marca una celda por escala y serie, y dibuja una línea por serie', () => {
    const svg = renderDASProfileSvg(dasNormSeries(scores, DAS_PROFILE_PRINT_COLORS));
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg.match(/rx="4.5"/g)).toHaveLength(10);
  });

  it('escapa los nombres de la leyenda', () => {
    const svg = renderDASProfileSvg([
      { label: 'Ana <b>&', scores, norm: 'GEN', color: '#000', dash: '2 3' },
    ]);
    expect(svg).toContain('Ana &lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
  });
});

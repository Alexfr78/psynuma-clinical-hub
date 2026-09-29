import { describe, it, expect } from 'vitest';
import {
  EAS_COMPONENT_ITEMS,
  easAnchorLabel,
  scoreEAS,
} from '../../../supabase/functions/_shared/easScoring';
import { renderEASTriangleSvg, EAS_TRIANGLE_PRINT_COLORS } from '../../../supabase/functions/_shared/easTriangleSvg';
import { getEASTemplateData } from '@/data/eas-template';

describe('EAS clave de corrección', () => {
  it('reparte los 45 ítems en tres componentes de 15 sin repetir', () => {
    const all = Object.values(EAS_COMPONENT_ITEMS).flat().sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    for (const items of Object.values(EAS_COMPONENT_ITEMS)) expect(items).toHaveLength(15);
  });

  it('la plantilla tiene los 45 ítems, escala 1-9 y sin espacios en blanco', () => {
    const template = getEASTemplateData();
    expect(template.items.map(i => i.index)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    expect(template.response_min).toBe(1);
    expect(template.response_max).toBe(9);
    expect(template.items.every(i => !i.text.includes('__'))).toBe(true);
  });
});

describe('EAS puntuación', () => {
  it('suma cada componente y el total', () => {
    const answers: Record<string, number> = {};
    for (const i of EAS_COMPONENT_ITEMS.INT) answers[i] = 9;
    for (const i of EAS_COMPONENT_ITEMS.PAS) answers[i] = 1;
    for (const i of EAS_COMPONENT_ITEMS.COM) answers[i] = 5;
    expect(scoreEAS(answers).factorScores).toEqual({ INT: 135, PAS: 15, COM: 75, TOTAL: 225 });
  });

  it('acepta respuestas como texto', () => {
    const answers = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [String(i + 1), '7']));
    expect(scoreEAS(answers).factorScores.TOTAL).toBe(315);
  });

  it('asocia la media por ítem al ancla más cercana', () => {
    expect(easAnchorLabel(1)).toBe('En absoluto');
    expect(easAnchorLabel(3.9)).toBe('Algo');
    expect(easAnchorLabel(5)).toBe('Moderadamente');
    expect(easAnchorLabel(7.9)).toBe('Bastante');
    expect(easAnchorLabel(9)).toBe('Extremadamente');
  });
});

describe('EAS triángulo', () => {
  const scores = { INT: 120, PAS: 90, COM: 100, TOTAL: 310 };

  it('dibuja un triángulo por serie con sus tres vértices', () => {
    const svg = renderEASTriangleSvg([
      { label: 'A', scores, color: '#000', dash: '' },
      { label: 'B', scores, color: '#f00', dash: '7 3' },
    ], EAS_TRIANGLE_PRINT_COLORS);
    // 3 triángulos de referencia + 2 series
    expect(svg.match(/<polygon/g)).toHaveLength(5);
    expect(svg.match(/<circle/g)).toHaveLength(6);
  });

  it('escapa los nombres de la leyenda', () => {
    const svg = renderEASTriangleSvg([{ label: 'Ana <b>', scores, color: '#000', dash: '' }]);
    expect(svg).toContain('Ana &lt;b&gt;');
  });
});

// EAS - Escala del modelo triangular del amor (Sternberg, 1997) - Adaptación
//
// 45 ítems de 1 a 9. Cada componente es la suma de sus 15 ítems (15-135) y el
// total la suma de los tres. No hay baremos: la interpretación usa las anclas de
// la propia escala sobre la media por ítem.

export type EASComponent = 'INT' | 'PAS' | 'COM';

export const EAS_COMPONENT_ITEMS: Record<EASComponent, number[]> = {
  INT: [2, 3, 4, 9, 10, 17, 18, 22, 25, 30, 31, 34, 38, 41, 45],
  PAS: [1, 5, 8, 11, 13, 15, 19, 21, 26, 28, 32, 35, 37, 40, 42],
  COM: [6, 7, 12, 14, 16, 20, 23, 24, 27, 29, 33, 36, 39, 43, 44],
};

export const EAS_COMPONENT_LABELS: Record<EASComponent, string> = {
  INT: 'Intimidad',
  PAS: 'Pasión',
  COM: 'Compromiso',
};

export const EAS_COMPONENT_MIN = 15;
export const EAS_COMPONENT_MAX = 135;

// Anclas de la hoja de respuesta: 1 en absoluto, 3 algo, 5 moderadamente,
// 7 bastante, 9 extremadamente. La media por ítem se asocia al ancla más cercana.
export function easAnchorLabel(meanPerItem: number): string {
  if (meanPerItem < 2) return 'En absoluto';
  if (meanPerItem < 4) return 'Algo';
  if (meanPerItem < 6) return 'Moderadamente';
  if (meanPerItem < 8) return 'Bastante';
  return 'Extremadamente';
}

export function scoreEAS(answers: Record<string, unknown>): { factorScores: Record<string, number> } {
  const factorScores: Record<string, number> = {};
  let total = 0;
  for (const [component, items] of Object.entries(EAS_COMPONENT_ITEMS)) {
    let sum = 0;
    for (const index of items) {
      const raw = answers[index] ?? answers[String(index)];
      const value = typeof raw === 'number' ? raw : parseInt(raw as string, 10);
      if (!isNaN(value)) sum += value;
    }
    factorScores[component] = sum;
    total += sum;
  }
  factorScores['TOTAL'] = total;
  return { factorScores };
}

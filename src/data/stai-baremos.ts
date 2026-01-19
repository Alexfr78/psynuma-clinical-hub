/**
 * STAI - Baremos Oficiales TEA Ediciones (9ª Edición, 2015)
 * 
 * Adaptación española: Buela-Casal, Guillén-Riquelme y Seisdedos Cubero
 * 
 * IMPORTANTE NOTA PERICIAL:
 * Estos baremos corresponden a la Tabla 10 del manual oficial (TEA, 9ª ed., pág. 38).
 * La conversión a percentiles y decatipos debe realizarse según las especificaciones
 * del manual, diferenciando por SEXO y GRUPO DE EDAD.
 * 
 * Grupos normativos:
 * - Adolescentes: 11-19 años (escolarizados en educación primaria/secundaria)
 * - Universitarios: Alumnos matriculados en carreras universitarias
 * - Adultos: Mayores de edad no universitarios
 */

export type AgeGroup = 'adolescent' | 'university' | 'adult';
export type Gender = 'male' | 'female';
export type Scale = 'A_E' | 'A_R';

interface BaremoEntry {
  percentile: number;
  decatipo: number;
  // Puntuaciones directas: [min, max] o valor único
  male: { A_E: [number, number]; A_R: [number, number] };
  female: { A_E: [number, number]; A_R: [number, number] };
}

interface NormativeData {
  n: { male: { A_E: number; A_R: number }; female: { A_E: number; A_R: number } };
  mean: { male: { A_E: number; A_R: number }; female: { A_E: number; A_R: number } };
  sd: { male: { A_E: number; A_R: number }; female: { A_E: number; A_R: number } };
}

/**
 * Baremos oficiales TEA 9ª edición - Tabla 10
 * Extraídos directamente del manual oficial (pág. 38)
 */
export const STAI_BAREMOS: Record<AgeGroup, { entries: BaremoEntry[]; normative: NormativeData }> = {
  adolescent: {
    normative: {
      n: { male: { A_E: 228, A_R: 228 }, female: { A_E: 306, A_R: 306 } },
      mean: { male: { A_E: 19.80, A_R: 22.29 }, female: { A_E: 20.92, A_R: 26.24 } },
      sd: { male: { A_E: 10.04, A_R: 8.63 }, female: { A_E: 10.57, A_R: 8.91 } },
    },
    entries: [
      { percentile: 99, decatipo: 10, male: { A_E: [39, 60], A_R: [42, 60] }, female: { A_E: [45, 60], A_R: [50, 60] } },
      { percentile: 97, decatipo: 10, male: { A_E: [37, 38], A_R: [37, 41] }, female: { A_E: [40, 44], A_R: [44, 49] } },
      { percentile: 95, decatipo: 9, male: { A_E: [34, 36], A_R: [36, 36] }, female: { A_E: [36, 39], A_R: [42, 43] } },
      { percentile: 90, decatipo: 8, male: { A_E: [33, 33], A_R: [34, 35] }, female: { A_E: [33, 35], A_R: [37, 41] } },
      { percentile: 87, decatipo: 8, male: { A_E: [32, 32], A_R: [33, 33] }, female: { A_E: [32, 32], A_R: [36, 36] } },
      { percentile: 85, decatipo: 7, male: { A_E: [30, 31], A_R: [31, 32] }, female: { A_E: [31, 31], A_R: [35, 35] } },
      { percentile: 80, decatipo: 7, male: { A_E: [29, 29], A_R: [30, 30] }, female: { A_E: [30, 30], A_R: [34, 34] } },
      { percentile: 77, decatipo: 7, male: { A_E: [28, 28], A_R: [29, 29] }, female: { A_E: [29, 29], A_R: [33, 33] } },
      { percentile: 75, decatipo: 6, male: { A_E: [27, 27], A_R: [27, 28] }, female: { A_E: [28, 28], A_R: [32, 32] } },
      { percentile: 70, decatipo: 6, male: { A_E: [26, 26], A_R: [26, 26] }, female: { A_E: [27, 27], A_R: [31, 31] } },
      { percentile: 65, decatipo: 6, male: { A_E: [25, 25], A_R: [25, 25] }, female: { A_E: [24, 25], A_R: [29, 30] } },
      { percentile: 60, decatipo: 5, male: { A_E: [23, 24], A_R: [24, 24] }, female: { A_E: [23, 23], A_R: [28, 28] } },
      { percentile: 55, decatipo: 5, male: { A_E: [21, 22], A_R: [23, 23] }, female: { A_E: [22, 22], A_R: [27, 27] } },
      { percentile: 50, decatipo: 5, male: { A_E: [19, 20], A_R: [22, 22] }, female: { A_E: [20, 21], A_R: [26, 26] } },
      { percentile: 45, decatipo: 5, male: { A_E: [18, 18], A_R: [21, 21] }, female: { A_E: [19, 19], A_R: [25, 25] } },
      { percentile: 40, decatipo: 4, male: { A_E: [17, 17], A_R: [20, 20] }, female: { A_E: [17, 18], A_R: [24, 24] } },
      { percentile: 35, decatipo: 4, male: { A_E: [15, 16], A_R: [19, 19] }, female: { A_E: [15, 16], A_R: [22, 23] } },
      { percentile: 30, decatipo: 4, male: { A_E: [13, 14], A_R: [17, 18] }, female: { A_E: [14, 14], A_R: [21, 21] } },
      { percentile: 25, decatipo: 3, male: { A_E: [12, 12], A_R: [16, 16] }, female: { A_E: [13, 13], A_R: [20, 20] } },
      { percentile: 23, decatipo: 3, male: { A_E: [11, 11], A_R: [15, 15] }, female: { A_E: [12, 12], A_R: [19, 19] } },
      { percentile: 20, decatipo: 3, male: { A_E: [9, 10], A_R: [14, 14] }, female: { A_E: [11, 11], A_R: [18, 18] } },
      { percentile: 15, decatipo: 2, male: { A_E: [8, 8], A_R: [13, 13] }, female: { A_E: [10, 10], A_R: [17, 17] } },
      { percentile: 13, decatipo: 2, male: { A_E: [7, 7], A_R: [10, 11] }, female: { A_E: [9, 9], A_R: [16, 16] } },
      { percentile: 10, decatipo: 2, male: { A_E: [5, 6], A_R: [8, 9] }, female: { A_E: [6, 8], A_R: [13, 15] } },
      { percentile: 5, decatipo: 1, male: { A_E: [3, 4], A_R: [8, 9] }, female: { A_E: [4, 5], A_R: [11, 12] } },
      { percentile: 3, decatipo: 1, male: { A_E: [1, 2], A_R: [7, 7] }, female: { A_E: [2, 3], A_R: [8, 10] } },
      { percentile: 1, decatipo: 1, male: { A_E: [0, 0], A_R: [0, 6] }, female: { A_E: [0, 1], A_R: [0, 7] } },
    ],
  },
  university: {
    normative: {
      n: { male: { A_E: 208, A_R: 193 }, female: { A_E: 379, A_R: 338 } },
      mean: { male: { A_E: 18.44, A_R: 19.02 }, female: { A_E: 20.01, A_R: 22.45 } },
      sd: { male: { A_E: 11.09, A_R: 9.49 }, female: { A_E: 11.47, A_R: 10.57 } },
    },
    entries: [
      { percentile: 99, decatipo: 10, male: { A_E: [39, 60], A_R: [41, 60] }, female: { A_E: [45, 60], A_R: [45, 60] } },
      { percentile: 97, decatipo: 10, male: { A_E: [38, 38], A_R: [38, 40] }, female: { A_E: [41, 44], A_R: [42, 44] } },
      { percentile: 95, decatipo: 9, male: { A_E: [35, 37], A_R: [34, 37] }, female: { A_E: [38, 40], A_R: [40, 41] } },
      { percentile: 90, decatipo: 8, male: { A_E: [32, 34], A_R: [30, 33] }, female: { A_E: [35, 37], A_R: [38, 39] } },
      { percentile: 87, decatipo: 8, male: { A_E: [31, 31], A_R: [29, 29] }, female: { A_E: [34, 34], A_R: [36, 37] } },
      { percentile: 85, decatipo: 7, male: { A_E: [30, 30], A_R: [28, 28] }, female: { A_E: [33, 33], A_R: [34, 35] } },
      { percentile: 80, decatipo: 7, male: { A_E: [28, 29], A_R: [27, 27] }, female: { A_E: [30, 32], A_R: [32, 33] } },
      { percentile: 77, decatipo: 7, male: { A_E: [27, 27], A_R: [26, 26] }, female: { A_E: [29, 29], A_R: [31, 31] } },
      { percentile: 75, decatipo: 6, male: { A_E: [26, 26], A_R: [25, 25] }, female: { A_E: [28, 28], A_R: [29, 30] } },
      { percentile: 70, decatipo: 6, male: { A_E: [24, 25], A_R: [23, 24] }, female: { A_E: [25, 27], A_R: [27, 28] } },
      { percentile: 65, decatipo: 6, male: { A_E: [22, 23], A_R: [22, 22] }, female: { A_E: [24, 24], A_R: [25, 26] } },
      { percentile: 60, decatipo: 5, male: { A_E: [21, 21], A_R: [20, 21] }, female: { A_E: [22, 23], A_R: [23, 24] } },
      { percentile: 55, decatipo: 5, male: { A_E: [18, 20], A_R: [19, 19] }, female: { A_E: [19, 21], A_R: [21, 22] } },
      { percentile: 50, decatipo: 5, male: { A_E: [17, 17], A_R: [18, 18] }, female: { A_E: [17, 18], A_R: [20, 20] } },
      { percentile: 45, decatipo: 5, male: { A_E: [15, 16], A_R: [17, 17] }, female: { A_E: [15, 16], A_R: [19, 19] } },
      { percentile: 40, decatipo: 4, male: { A_E: [13, 14], A_R: [16, 16] }, female: { A_E: [14, 14], A_R: [18, 18] } },
      { percentile: 35, decatipo: 4, male: { A_E: [12, 12], A_R: [15, 15] }, female: { A_E: [13, 13], A_R: [17, 17] } },
      { percentile: 30, decatipo: 4, male: { A_E: [11, 11], A_R: [13, 14] }, female: { A_E: [12, 12], A_R: [15, 16] } },
      { percentile: 25, decatipo: 3, male: { A_E: [10, 10], A_R: [12, 12] }, female: { A_E: [11, 11], A_R: [14, 14] } },
      { percentile: 23, decatipo: 3, male: { A_E: [9, 9], A_R: [11, 11] }, female: { A_E: [10, 10], A_R: [13, 13] } },
      { percentile: 20, decatipo: 3, male: { A_E: [7, 8], A_R: [10, 10] }, female: { A_E: [9, 9], A_R: [13, 13] } },
      { percentile: 15, decatipo: 2, male: { A_E: [6, 6], A_R: [9, 9] }, female: { A_E: [8, 8], A_R: [12, 12] } },
      { percentile: 13, decatipo: 2, male: { A_E: [5, 5], A_R: [8, 8] }, female: { A_E: [7, 7], A_R: [11, 11] } },
      { percentile: 10, decatipo: 2, male: { A_E: [4, 4], A_R: [6, 7] }, female: { A_E: [5, 6], A_R: [9, 10] } },
      { percentile: 5, decatipo: 1, male: { A_E: [2, 3], A_R: [4, 5] }, female: { A_E: [4, 4], A_R: [8, 8] } },
      { percentile: 3, decatipo: 1, male: { A_E: [1, 1], A_R: [3, 3] }, female: { A_E: [3, 3], A_R: [6, 7] } },
      { percentile: 1, decatipo: 1, male: { A_E: [0, 0], A_R: [0, 2] }, female: { A_E: [0, 2], A_R: [0, 5] } },
    ],
  },
  adult: {
    normative: {
      n: { male: { A_E: 443, A_R: 447 }, female: { A_E: 690, A_R: 693 } },
      mean: { male: { A_E: 16.25, A_R: 18.98 }, female: { A_E: 18.32, A_R: 23.37 } },
      sd: { male: { A_E: 9.65, A_R: 9.75 }, female: { A_E: 11.33, A_R: 10.45 } },
    },
    entries: [
      { percentile: 99, decatipo: 10, male: { A_E: [39, 60], A_R: [41, 60] }, female: { A_E: [44, 60], A_R: [47, 60] } },
      { percentile: 97, decatipo: 10, male: { A_E: [35, 38], A_R: [39, 40] }, female: { A_E: [42, 43], A_R: [45, 46] } },
      { percentile: 95, decatipo: 9, male: { A_E: [31, 34], A_R: [35, 38] }, female: { A_E: [37, 41], A_R: [41, 44] } },
      { percentile: 90, decatipo: 8, male: { A_E: [28, 30], A_R: [32, 34] }, female: { A_E: [33, 36], A_R: [37, 40] } },
      { percentile: 87, decatipo: 8, male: { A_E: [27, 27], A_R: [31, 31] }, female: { A_E: [30, 32], A_R: [35, 36] } },
      { percentile: 85, decatipo: 7, male: { A_E: [26, 26], A_R: [29, 30] }, female: { A_E: [28, 29], A_R: [33, 34] } },
      { percentile: 80, decatipo: 7, male: { A_E: [24, 25], A_R: [27, 28] }, female: { A_E: [26, 27], A_R: [31, 32] } },
      { percentile: 77, decatipo: 7, male: { A_E: [23, 23], A_R: [26, 26] }, female: { A_E: [25, 25], A_R: [30, 30] } },
      { percentile: 75, decatipo: 6, male: { A_E: [21, 22], A_R: [24, 25] }, female: { A_E: [23, 24], A_R: [28, 29] } },
      { percentile: 70, decatipo: 6, male: { A_E: [20, 20], A_R: [23, 23] }, female: { A_E: [21, 22], A_R: [27, 27] } },
      { percentile: 65, decatipo: 6, male: { A_E: [18, 19], A_R: [21, 22] }, female: { A_E: [20, 20], A_R: [25, 26] } },
      { percentile: 60, decatipo: 5, male: { A_E: [17, 17], A_R: [20, 20] }, female: { A_E: [18, 19], A_R: [24, 24] } },
      { percentile: 55, decatipo: 5, male: { A_E: [16, 16], A_R: [19, 19] }, female: { A_E: [17, 17], A_R: [23, 23] } },
      { percentile: 50, decatipo: 5, male: { A_E: [15, 15], A_R: [18, 18] }, female: { A_E: [15, 16], A_R: [22, 22] } },
      { percentile: 45, decatipo: 5, male: { A_E: [14, 14], A_R: [16, 17] }, female: { A_E: [14, 14], A_R: [20, 21] } },
      { percentile: 40, decatipo: 4, male: { A_E: [13, 13], A_R: [15, 15] }, female: { A_E: [13, 13], A_R: [19, 19] } },
      { percentile: 35, decatipo: 4, male: { A_E: [12, 12], A_R: [14, 14] }, female: { A_E: [12, 12], A_R: [18, 18] } },
      { percentile: 30, decatipo: 4, male: { A_E: [11, 11], A_R: [13, 13] }, female: { A_E: [11, 11], A_R: [17, 17] } },
      { percentile: 25, decatipo: 3, male: { A_E: [9, 10], A_R: [12, 12] }, female: { A_E: [10, 10], A_R: [16, 16] } },
      { percentile: 23, decatipo: 3, male: { A_E: [9, 9], A_R: [11, 11] }, female: { A_E: [9, 9], A_R: [15, 15] } },
      { percentile: 20, decatipo: 3, male: { A_E: [8, 8], A_R: [10, 10] }, female: { A_E: [8, 8], A_R: [14, 14] } },
      { percentile: 15, decatipo: 2, male: { A_E: [7, 7], A_R: [9, 9] }, female: { A_E: [7, 7], A_R: [13, 13] } },
      { percentile: 13, decatipo: 2, male: { A_E: [6, 6], A_R: [8, 8] }, female: { A_E: [6, 6], A_R: [11, 12] } },
      { percentile: 10, decatipo: 2, male: { A_E: [4, 5], A_R: [7, 7] }, female: { A_E: [5, 5], A_R: [10, 10] } },
      { percentile: 5, decatipo: 1, male: { A_E: [3, 3], A_R: [5, 6] }, female: { A_E: [3, 4], A_R: [8, 9] } },
      { percentile: 3, decatipo: 1, male: { A_E: [2, 2], A_R: [3, 4] }, female: { A_E: [2, 2], A_R: [6, 7] } },
      { percentile: 1, decatipo: 1, male: { A_E: [0, 1], A_R: [0, 2] }, female: { A_E: [0, 1], A_R: [0, 5] } },
    ],
  },
};

/**
 * Determina el grupo de edad normativo según el manual TEA
 */
export function getAgeGroup(age: number, isUniversityStudent?: boolean): AgeGroup {
  if (age <= 19) return 'adolescent';
  if (isUniversityStudent) return 'university';
  return 'adult';
}

/**
 * Obtiene percentil y decatipo según baremos oficiales TEA
 * Consulta la Tabla 10 del manual (pág. 38)
 */
export function getSTAIPercentileOfficial(
  score: number,
  scale: Scale,
  gender: Gender,
  ageGroup: AgeGroup
): { percentile: number; decatipo: number } {
  const baremo = STAI_BAREMOS[ageGroup];
  
  for (const entry of baremo.entries) {
    const range = entry[gender][scale];
    if (score >= range[0] && score <= range[1]) {
      return { percentile: entry.percentile, decatipo: entry.decatipo };
    }
  }
  
  // Si no encuentra en las entradas, calcular por interpolación
  // Puntuación por encima del máximo tabulado
  if (score >= 60) {
    return { percentile: 99, decatipo: 10 };
  }
  
  // Puntuación por debajo del mínimo tabulado
  return { percentile: 1, decatipo: 1 };
}

/**
 * Genera nota metodológica para informes periciales
 */
export function generateMethodologicalNote(
  gender: Gender,
  ageGroup: AgeGroup,
  administrationDate: Date
): string {
  const groupLabels: Record<AgeGroup, string> = {
    adolescent: 'Adolescentes (11-19 años)',
    university: 'Universitarios',
    adult: 'Adultos',
  };
  
  const genderLabels: Record<Gender, string> = {
    male: 'Varones',
    female: 'Mujeres',
  };
  
  const normative = STAI_BAREMOS[ageGroup].normative;
  const n = normative.n[gender];
  
  return `
NOTA METODOLÓGICA

Instrumento: STAI - Cuestionario de Ansiedad Estado-Rasgo
Autores originales: C.D. Spielberger, R.L. Gorsuch y R.E. Lushene
Adaptación española: G. Buela-Casal, A. Guillén-Riquelme y N. Seisdedos Cubero
Editorial: TEA Ediciones, S.A.U.
Edición utilizada: 9ª edición revisada (2015)

Baremo aplicado: ${groupLabels[ageGroup]} - ${genderLabels[gender]}
Muestra normativa: N(A/E)=${n.A_E}, N(A/R)=${n.A_R}

Fecha de administración: ${administrationDate.toLocaleDateString('es-ES')}

ADVERTENCIAS PERICIALES:
1. Las puntuaciones transformadas (percentiles y decatipos) se han obtenido 
   consultando la Tabla 10 del manual oficial (pág. 38).
2. Los resultados reflejan el autoinforme del evaluado en el momento de la 
   administración y no constituyen por sí mismos un diagnóstico clínico.
3. La interpretación debe realizarse en el contexto de una evaluación 
   psicológica completa que incluya entrevista clínica y otros instrumentos.
4. El STAI mide la ansiedad autoinformada; no detecta simulación ni disimulación.
5. Los baremos utilizados corresponden a población española (muestras recogidas 
   entre 2005-2010).
`.trim();
}

/**
 * Ítems invertidos según el manual TEA (pág. 16-17)
 */
export const STAI_REVERSED_ITEMS_OFFICIAL = {
  A_E: [1, 2, 5, 8, 10, 11, 15, 16, 19, 20],
  A_R: [21, 26, 27, 30, 33, 36, 39],
};

/**
 * Valida que la corrección sigue el procedimiento del manual
 */
export function validateSTAIScoring(
  answers: Record<number, number>,
  responseMin: number,
  responseMax: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Verificar rango de respuestas (0-3 según adaptación española)
  if (responseMin !== 0 || responseMax !== 3) {
    errors.push(`Escala incorrecta: debe ser 0-3 según adaptación española TEA (actual: ${responseMin}-${responseMax})`);
  }
  
  // Verificar que hay 40 respuestas
  const answeredItems = Object.keys(answers).map(k => parseInt(k, 10));
  if (answeredItems.length !== 40) {
    errors.push(`Número incorrecto de respuestas: ${answeredItems.length} (esperado: 40)`);
  }
  
  // Verificar ítems 1-20 para A/E y 21-40 para A/R
  for (let i = 1; i <= 40; i++) {
    if (answers[i] === undefined) {
      errors.push(`Ítem ${i} sin respuesta`);
    } else if (answers[i] < 0 || answers[i] > 3) {
      errors.push(`Ítem ${i} con valor fuera de rango: ${answers[i]}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

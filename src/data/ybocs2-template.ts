/**
 * Y-BOCS-II - Escala de Obsesiones y Compulsiones de Yale-Brown (Segunda Edición)
 * Goodman, Rasmussen, Price & Storch, 2006
 * 
 * 10 ítems de severidad (1-5 obsesiones, 6-10 compulsiones)
 * Cada ítem puntuado de 0 a 5. Rango total: 0-50.
 */

export interface YBOCS2Option {
  value: number;
  text: string;
}

export interface YBOCS2Item {
  index: number;
  label: string;
  text: string;
  options: YBOCS2Option[];
}

// Puntos de corte (Storch et al., 2010; Goodman et al., 2006)
export const YBOCS2_CUTOFFS = [
  { min: 0, max: 7, level: 'subclinico', label: 'Subclínico', color: 'green' },
  { min: 8, max: 15, level: 'leve', label: 'TOC Leve', color: 'yellow' },
  { min: 16, max: 23, level: 'moderado', label: 'TOC Moderado', color: 'orange' },
  { min: 24, max: 31, level: 'grave', label: 'TOC Grave', color: 'red' },
  { min: 32, max: 50, level: 'extremo', label: 'TOC Extremo', color: 'red' },
];

const YBOCS2_ITEMS: YBOCS2Item[] = [
  // ── OBSESIONES (ítems 1-5) ──
  {
    index: 1,
    label: 'Tiempo dedicado a obsesiones',
    text: '¿Cuánto tiempo le ocupan los pensamientos obsesivos?',
    options: [
      { value: 0, text: 'Ninguno.' },
      { value: 1, text: 'Leve: menos de 1 hora al día, o intrusiones ocasionales.' },
      { value: 2, text: 'Moderado: de 1 a 3 horas al día, o intrusiones frecuentes.' },
      { value: 3, text: 'Severo: de 3 a 8 horas al día, o intrusiones muy frecuentes.' },
      { value: 4, text: 'Muy severo: de 8 a 12 horas al día, o intrusiones casi constantes.' },
      { value: 5, text: 'Extremo: más de 12 horas al día, o intrusiones constantes e incapacitantes.' },
    ],
  },
  {
    index: 2,
    label: 'Intervalos libres de obsesiones',
    text: 'En promedio, ¿cuál es el período continuo de tiempo más largo sin pensamientos obsesivos?',
    options: [
      { value: 0, text: 'Sin síntomas: no hay obsesiones.' },
      { value: 1, text: 'Largo: más de 8 horas seguidas sin obsesiones.' },
      { value: 2, text: 'Moderado: de 3 a 8 horas seguidas sin obsesiones.' },
      { value: 3, text: 'Corto: de 1 a 3 horas seguidas sin obsesiones.' },
      { value: 4, text: 'Muy corto: de minutos a menos de 1 hora sin obsesiones.' },
      { value: 5, text: 'Ninguno: las obsesiones son constantes, sin intervalos libres.' },
    ],
  },
  {
    index: 3,
    label: 'Control sobre las obsesiones',
    text: '¿Cuánto control tiene sobre los pensamientos obsesivos? ¿Puede detenerlos o ignorarlos?',
    options: [
      { value: 0, text: 'Control total: puede detener o ignorar las obsesiones completamente.' },
      { value: 1, text: 'Mucho control: generalmente puede detener o desviar las obsesiones con esfuerzo.' },
      { value: 2, text: 'Control moderado: a veces puede detener o desviar las obsesiones.' },
      { value: 3, text: 'Algo de control: rara vez logra detener las obsesiones, solo puede desviar la atención con dificultad.' },
      { value: 4, text: 'Mínimo control: las obsesiones son difíciles de ignorar, solo logra desviarlas momentáneamente.' },
      { value: 5, text: 'Sin control: las obsesiones se experimentan como completamente involuntarias, incapaz de alterarlas.' },
    ],
  },
  {
    index: 4,
    label: 'Angustia por las obsesiones',
    text: '¿Cuánto le molestan o perturban sus pensamientos obsesivos?',
    options: [
      { value: 0, text: 'Ninguna angustia.' },
      { value: 1, text: 'Leve: ligeramente perturbador, pero manejable.' },
      { value: 2, text: 'Moderada: perturbador, pero con alguna dificultad para manejarlo.' },
      { value: 3, text: 'Severa: muy perturbador, más difícil de manejar.' },
      { value: 4, text: 'Muy severa: angustia casi constante y muy perturbadora.' },
      { value: 5, text: 'Extrema: angustia abrumadora e incapacitante.' },
    ],
  },
  {
    index: 5,
    label: 'Interferencia de las obsesiones',
    text: '¿En qué medida sus pensamientos obsesivos interfieren en su funcionamiento social, laboral o académico?',
    options: [
      { value: 0, text: 'Ninguna interferencia.' },
      { value: 1, text: 'Leve: ligera interferencia, pero el rendimiento general no se ve afectado.' },
      { value: 2, text: 'Moderada: interferencia definida, pero aún manejable.' },
      { value: 3, text: 'Severa: deterioro significativo en una o más áreas de funcionamiento.' },
      { value: 4, text: 'Muy severa: deterioro significativo en todas las áreas de funcionamiento.' },
      { value: 5, text: 'Extrema: incapacitante, no puede funcionar de forma autónoma.' },
    ],
  },
  // ── COMPULSIONES (ítems 6-10) ──
  {
    index: 6,
    label: 'Tiempo dedicado a compulsiones',
    text: '¿Cuánto tiempo dedica a realizar conductas compulsivas?',
    options: [
      { value: 0, text: 'Ninguno.' },
      { value: 1, text: 'Leve: menos de 1 hora al día en rituales, o ejecución ocasional.' },
      { value: 2, text: 'Moderado: de 1 a 3 horas al día en rituales, o ejecución frecuente.' },
      { value: 3, text: 'Severo: de 3 a 8 horas al día en rituales, o ejecución muy frecuente.' },
      { value: 4, text: 'Muy severo: de 8 a 12 horas al día en rituales, o ejecución casi constante.' },
      { value: 5, text: 'Extremo: más de 12 horas al día en rituales, o ejecución constante e incapacitante.' },
    ],
  },
  {
    index: 7,
    label: 'Resistencia ante las compulsiones',
    text: '¿Cuánto esfuerzo emplea en resistirse a las compulsiones?',
    options: [
      { value: 0, text: 'Siempre se resiste: hace un esfuerzo constante por resistirse a todas las compulsiones.' },
      { value: 1, text: 'Se resiste la mayoría del tiempo: intenta resistirse la mayor parte de las veces.' },
      { value: 2, text: 'Esfuerzo moderado: hace cierto esfuerzo por resistirse.' },
      { value: 3, text: 'Algo de esfuerzo: cede ante la mayoría de las compulsiones sin intentar controlarlas, pero lo hace con algo de resistencia.' },
      { value: 4, text: 'Cede ante la mayoría: cede ante casi todas las compulsiones sin intentar controlarlas.' },
      { value: 5, text: 'Cede completamente: cede ante todas las compulsiones sin intentar resistirse en absoluto.' },
    ],
  },
  {
    index: 8,
    label: 'Control sobre las compulsiones',
    text: '¿Cuánto control tiene sobre las conductas compulsivas?',
    options: [
      { value: 0, text: 'Control total: puede detener las compulsiones completamente.' },
      { value: 1, text: 'Mucho control: generalmente puede detener las compulsiones con esfuerzo.' },
      { value: 2, text: 'Control moderado: a veces puede detener las compulsiones, siente presión pero logra controlarlas a menudo.' },
      { value: 3, text: 'Algo de control: fuerte impulso por realizar compulsiones, solo a veces puede controlarlas.' },
      { value: 4, text: 'Mínimo control: rara vez puede detener las compulsiones, una vez iniciadas debe terminarlas.' },
      { value: 5, text: 'Sin control: el impulso es completamente involuntario y abrumador, incapaz de detener o aplazar las compulsiones.' },
    ],
  },
  {
    index: 9,
    label: 'Angustia al no poder compulsionar',
    text: '¿Cómo se sentiría si se le impidiera realizar sus compulsiones? ¿Qué grado de angustia experimentaría?',
    options: [
      { value: 0, text: 'Ninguna angustia.' },
      { value: 1, text: 'Leve: ligeramente perturbador si se impidieran las compulsiones.' },
      { value: 2, text: 'Moderada: angustia marcada al impedir algunas compulsiones, pero manejable.' },
      { value: 3, text: 'Severa: angustia marcada al impedir la mayoría de las compulsiones.' },
      { value: 4, text: 'Muy severa: ansiedad abrumadora si se posponen las compulsiones.' },
      { value: 5, text: 'Extrema: angustia incapacitante ante cualquier intento de posponer las compulsiones.' },
    ],
  },
  {
    index: 10,
    label: 'Interferencia de las compulsiones',
    text: '¿En qué medida sus comportamientos compulsivos interfieren en su funcionamiento social, laboral o académico?',
    options: [
      { value: 0, text: 'Ninguna interferencia.' },
      { value: 1, text: 'Leve: ligera interferencia, pero el rendimiento general no se ve afectado.' },
      { value: 2, text: 'Moderada: interferencia sustancial en una o más áreas, pero aún manejable.' },
      { value: 3, text: 'Severa: deterioro significativo en todas las áreas de funcionamiento.' },
      { value: 4, text: 'Muy severa: funcionamiento muy limitado, las compulsiones son evidentes para los demás.' },
      { value: 5, text: 'Extrema: incapacitante, los comportamientos son imposibles de ocultar.' },
    ],
  },
];

// Scoring configuration
const YBOCS2_SCORING: Record<string, { items: number[]; label: string; description?: string }> = {
  TOTAL: {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    label: 'Puntuación Total',
    description: 'Suma de todos los ítems (0-50)',
  },
  OBSESIONES: {
    items: [1, 2, 3, 4, 5],
    label: 'Subescala de Obsesiones',
    description: 'Gravedad de las obsesiones (ítems 1-5, rango 0-25)',
  },
  COMPULSIONES: {
    items: [6, 7, 8, 9, 10],
    label: 'Subescala de Compulsiones',
    description: 'Gravedad de las compulsiones (ítems 6-10, rango 0-25)',
  },
};

export const YBOCS2_TEMPLATE = {
  code: 'YBOCS2',
  name: 'Y-BOCS-II - Escala de Obsesiones y Compulsiones de Yale-Brown',
  description: 'Evaluación de la gravedad de síntomas obsesivo-compulsivos. 10 ítems de severidad (5 obsesiones + 5 compulsiones). Escala 0-5 por ítem, rango total 0-50.',
  version: 1,
  response_min: 0,
  response_max: 5,
  items: YBOCS2_ITEMS,
  scoring: YBOCS2_SCORING,
  instructions: `Esta escala evalúa la gravedad de los síntomas obsesivo-compulsivos durante la ÚLTIMA SEMANA, incluyendo el día de hoy.

Para cada pregunta, seleccione la opción que mejor describa su experiencia. Las preguntas 1 a 5 se refieren a sus OBSESIONES (pensamientos, imágenes o impulsos no deseados y perturbadores que se presentan repetidamente en su mente). Las preguntas 6 a 10 se refieren a sus COMPULSIONES (conductas o acciones mentales que se siente impulsado a realizar, aunque reconozca que son excesivas o sin sentido).

Seleccione una sola respuesta por pregunta.`,
  flag_threshold: 16,
  chart_full_mark: 50,
  cutoffs: YBOCS2_CUTOFFS,
};

export function getYBOCS2TemplateData() {
  return {
    code: YBOCS2_TEMPLATE.code,
    name: YBOCS2_TEMPLATE.name,
    description: YBOCS2_TEMPLATE.description,
    version: YBOCS2_TEMPLATE.version,
    response_min: YBOCS2_TEMPLATE.response_min,
    response_max: YBOCS2_TEMPLATE.response_max,
    min_label: '',
    max_label: '',
    items: YBOCS2_TEMPLATE.items,
    scoring: YBOCS2_TEMPLATE.scoring,
    instructions: YBOCS2_TEMPLATE.instructions,
    flag_threshold: YBOCS2_TEMPLATE.flag_threshold,
    chart_full_mark: YBOCS2_TEMPLATE.chart_full_mark,
    is_active: true,
    interpretations: null,
  };
}

export default YBOCS2_TEMPLATE;

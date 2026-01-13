/**
 * BDI-II - Inventario de Depresión de Beck-II
 * Adaptación española de Sanz y Vázquez (2011)
 * © Pearson Clinical & Talent Assessment
 */

export interface BDI2Option {
  value: number;
  text: string;
}

export interface BDI2Item {
  index: number;
  label: string;
  options: BDI2Option[];
}

export interface BDI2Template {
  code: string;
  name: string;
  description: string;
  version: number;
  response_min: number;
  response_max: number;
  items: BDI2Item[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  instructions: string;
  flag_threshold: number;
  chart_full_mark: number;
  cutoffs: { min: number; max: number; level: string; label: string; color: string }[];
}

// Puntos de corte oficiales (Manual BDI-II, Tabla 2.1)
export const BDI2_CUTOFFS = [
  { min: 0, max: 13, level: 'minima', label: 'Depresión Mínima', color: 'green' },
  { min: 14, max: 19, level: 'leve', label: 'Depresión Leve', color: 'yellow' },
  { min: 20, max: 28, level: 'moderada', label: 'Depresión Moderada', color: 'orange' },
  { min: 29, max: 63, level: 'grave', label: 'Depresión Grave', color: 'red' },
];

// 21 ítems oficiales del BDI-II (Adaptación española)
const BDI2_ITEMS: BDI2Item[] = [
  {
    index: 1,
    label: 'Tristeza',
    options: [
      { value: 0, text: 'No me siento triste habitualmente.' },
      { value: 1, text: 'Me siento triste gran parte del tiempo.' },
      { value: 2, text: 'Me siento triste continuamente.' },
      { value: 3, text: 'Me siento tan triste o tan desgraciado que no puedo soportarlo.' },
    ],
  },
  {
    index: 2,
    label: 'Pesimismo',
    options: [
      { value: 0, text: 'No estoy desanimado sobre mi futuro.' },
      { value: 1, text: 'Me siento más desanimado sobre mi futuro que antes.' },
      { value: 2, text: 'No espero que las cosas mejoren.' },
      { value: 3, text: 'Siento que mi futuro es desesperanzador y que las cosas solo empeorarán.' },
    ],
  },
  {
    index: 3,
    label: 'Sentimientos de fracaso',
    options: [
      { value: 0, text: 'No me siento fracasado.' },
      { value: 1, text: 'He fracasado más de lo que debería.' },
      { value: 2, text: 'Cuando miro atrás, veo fracaso tras fracaso.' },
      { value: 3, text: 'Me siento una persona totalmente fracasada.' },
    ],
  },
  {
    index: 4,
    label: 'Pérdida de placer',
    options: [
      { value: 0, text: 'Disfruto de las cosas que me gustan tanto como antes.' },
      { value: 1, text: 'No disfruto de las cosas tanto como antes.' },
      { value: 2, text: 'Obtengo muy poco placer de las cosas con las que antes disfrutaba.' },
      { value: 3, text: 'No obtengo ningún placer de las cosas con las que antes disfrutaba.' },
    ],
  },
  {
    index: 5,
    label: 'Sentimientos de culpa',
    options: [
      { value: 0, text: 'No me siento especialmente culpable.' },
      { value: 1, text: 'Me siento culpable de muchas cosas que he hecho o debería haber hecho.' },
      { value: 2, text: 'Me siento bastante culpable la mayor parte del tiempo.' },
      { value: 3, text: 'Me siento culpable constantemente.' },
    ],
  },
  {
    index: 6,
    label: 'Sentimientos de castigo',
    options: [
      { value: 0, text: 'No siento que esté siendo castigado.' },
      { value: 1, text: 'Siento que puedo ser castigado.' },
      { value: 2, text: 'Espero ser castigado.' },
      { value: 3, text: 'Siento que estoy siendo castigado.' },
    ],
  },
  {
    index: 7,
    label: 'Insatisfacción con uno mismo',
    options: [
      { value: 0, text: 'Siento lo mismo que antes sobre mí mismo.' },
      { value: 1, text: 'He perdido confianza en mí mismo.' },
      { value: 2, text: 'Estoy decepcionado conmigo mismo.' },
      { value: 3, text: 'No me gusto.' },
    ],
  },
  {
    index: 8,
    label: 'Autocríticas',
    options: [
      { value: 0, text: 'No me critico o me culpo más que antes.' },
      { value: 1, text: 'Soy más crítico conmigo mismo de lo que solía ser.' },
      { value: 2, text: 'Critico todos mis defectos.' },
      { value: 3, text: 'Me culpo por todo lo malo que sucede.' },
    ],
  },
  {
    index: 9,
    label: 'Pensamientos o deseos de suicidio',
    options: [
      { value: 0, text: 'No tengo ningún pensamiento de suicidio.' },
      { value: 1, text: 'Tengo pensamientos de suicidio, pero no los llevaría a cabo.' },
      { value: 2, text: 'Me gustaría suicidarme.' },
      { value: 3, text: 'Me suicidaría si tuviera la oportunidad.' },
    ],
  },
  {
    index: 10,
    label: 'Llanto',
    options: [
      { value: 0, text: 'No lloro más de lo que solía hacerlo.' },
      { value: 1, text: 'Lloro más de lo que solía hacerlo.' },
      { value: 2, text: 'Lloro por cualquier cosa.' },
      { value: 3, text: 'Tengo ganas de llorar continuamente, pero no puedo.' },
    ],
  },
  {
    index: 11,
    label: 'Agitación',
    options: [
      { value: 0, text: 'No estoy más inquieto o agitado que de costumbre.' },
      { value: 1, text: 'Me siento más inquieto o agitado que de costumbre.' },
      { value: 2, text: 'Estoy tan inquieto o agitado que me cuesta estarme quieto.' },
      { value: 3, text: 'Estoy tan inquieto o agitado que tengo que estar continuamente moviéndome o haciendo algo.' },
    ],
  },
  {
    index: 12,
    label: 'Pérdida de interés',
    options: [
      { value: 0, text: 'No he perdido el interés por otras personas o actividades.' },
      { value: 1, text: 'Estoy menos interesado que antes por otras personas o actividades.' },
      { value: 2, text: 'He perdido la mayor parte de mi interés por los demás o por las cosas.' },
      { value: 3, text: 'Me resulta difícil interesarme por algo.' },
    ],
  },
  {
    index: 13,
    label: 'Indecisión',
    options: [
      { value: 0, text: 'Tomo decisiones más o menos como siempre.' },
      { value: 1, text: 'Tomar decisiones me resulta más difícil que de costumbre.' },
      { value: 2, text: 'Tengo mucha más dificultad en tomar decisiones que antes.' },
      { value: 3, text: 'Tengo problemas para tomar cualquier decisión.' },
    ],
  },
  {
    index: 14,
    label: 'Inutilidad',
    options: [
      { value: 0, text: 'No me siento inútil.' },
      { value: 1, text: 'No me considero tan valioso y útil como solía ser.' },
      { value: 2, text: 'Me siento más inútil en comparación con otras personas.' },
      { value: 3, text: 'Me siento completamente inútil.' },
    ],
  },
  {
    index: 15,
    label: 'Pérdida de energía',
    options: [
      { value: 0, text: 'Tengo tanta energía como siempre.' },
      { value: 1, text: 'Tengo menos energía de la que solía tener.' },
      { value: 2, text: 'No tengo suficiente energía para hacer muchas cosas.' },
      { value: 3, text: 'No tengo suficiente energía para hacer nada.' },
    ],
  },
  {
    index: 16,
    label: 'Cambios en el patrón de sueño',
    options: [
      { value: 0, text: 'No he experimentado ningún cambio en mi patrón de sueño.' },
      { value: 1, text: 'Duermo algo más o algo menos de lo habitual.' },
      { value: 2, text: 'Duermo mucho más o mucho menos de lo habitual.' },
      { value: 3, text: 'Duermo la mayor parte del día o me despierto 1-2 horas antes y no puedo volver a dormirme.' },
    ],
  },
  {
    index: 17,
    label: 'Irritabilidad',
    options: [
      { value: 0, text: 'No estoy más irritable de lo habitual.' },
      { value: 1, text: 'Estoy más irritable de lo habitual.' },
      { value: 2, text: 'Estoy mucho más irritable de lo habitual.' },
      { value: 3, text: 'Estoy irritable continuamente.' },
    ],
  },
  {
    index: 18,
    label: 'Cambios en el apetito',
    options: [
      { value: 0, text: 'No he experimentado ningún cambio en mi apetito.' },
      { value: 1, text: 'Mi apetito es algo menor o algo mayor de lo habitual.' },
      { value: 2, text: 'Mi apetito es mucho menor o mucho mayor de lo habitual.' },
      { value: 3, text: 'No tengo nada de apetito o tengo ganas de comer continuamente.' },
    ],
  },
  {
    index: 19,
    label: 'Dificultad de concentración',
    options: [
      { value: 0, text: 'Puedo concentrarme tan bien como siempre.' },
      { value: 1, text: 'No puedo concentrarme tan bien como habitualmente.' },
      { value: 2, text: 'Me cuesta mantener la atención sobre algo durante mucho tiempo.' },
      { value: 3, text: 'No puedo concentrarme en nada.' },
    ],
  },
  {
    index: 20,
    label: 'Cansancio o fatiga',
    options: [
      { value: 0, text: 'No estoy más cansado o fatigado que de costumbre.' },
      { value: 1, text: 'Me canso o fatigo más fácilmente que de costumbre.' },
      { value: 2, text: 'Estoy demasiado cansado o fatigado para hacer muchas cosas que antes hacía.' },
      { value: 3, text: 'Estoy demasiado cansado o fatigado para hacer la mayoría de las cosas que antes hacía.' },
    ],
  },
  {
    index: 21,
    label: 'Pérdida de interés por el sexo',
    options: [
      { value: 0, text: 'No he notado ningún cambio reciente en mi interés por el sexo.' },
      { value: 1, text: 'Estoy menos interesado por el sexo de lo que solía estar.' },
      { value: 2, text: 'Estoy mucho menos interesado por el sexo ahora.' },
      { value: 3, text: 'He perdido completamente el interés por el sexo.' },
    ],
  },
];

// Scoring configuration
const BDI2_SCORING: Record<string, { items: number[]; label: string; description?: string }> = {
  TOTAL: {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    label: 'Puntuación Total',
    description: 'Suma de todos los ítems (0-63)',
  },
  COG_AFECT: {
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    label: 'Dimensión Cognitivo-Afectiva',
    description: 'Síntomas cognitivos y afectivos (ítems 1-14)',
  },
  SOM_VEG: {
    items: [15, 16, 17, 18, 19, 20, 21],
    label: 'Dimensión Somático-Vegetativa',
    description: 'Síntomas somáticos y vegetativos (ítems 15-21)',
  },
};

export const BDI2_TEMPLATE: BDI2Template = {
  code: 'BDI2',
  name: 'Inventario de Depresión de Beck-II',
  description: 'Evaluación de la presencia y gravedad de síntomas depresivos en adultos y adolescentes mayores de 13 años. Marco temporal: últimas dos semanas.',
  version: 1,
  response_min: 0,
  response_max: 3,
  items: BDI2_ITEMS,
  scoring: BDI2_SCORING,
  instructions: `Por favor, lea con atención cada uno de los siguientes grupos de afirmaciones y, a continuación, elija de cada grupo la afirmación que mejor describa el modo en que se ha sentido DURANTE LAS DOS ÚLTIMAS SEMANAS, INCLUYENDO EL DÍA DE HOY.

Si dentro de un mismo grupo hay más de una afirmación que considere aplicable a su caso, elija aquella que tenga el número más alto.

Asegúrese de no elegir más de una respuesta por grupo, incluyendo el grupo 16 (Cambios en el Patrón de Sueño) y el grupo 18 (Cambios en el Apetito).`,
  flag_threshold: 14,
  chart_full_mark: 63,
  cutoffs: BDI2_CUTOFFS,
};

// Function to get template data for database insertion
export function getBDI2TemplateData() {
  return {
    code: BDI2_TEMPLATE.code,
    name: BDI2_TEMPLATE.name,
    description: BDI2_TEMPLATE.description,
    version: BDI2_TEMPLATE.version,
    response_min: BDI2_TEMPLATE.response_min,
    response_max: BDI2_TEMPLATE.response_max,
    min_label: '', // Not used for BDI-II
    max_label: '', // Not used for BDI-II
    items: BDI2_TEMPLATE.items,
    scoring: BDI2_TEMPLATE.scoring,
    instructions: BDI2_TEMPLATE.instructions,
    flag_threshold: BDI2_TEMPLATE.flag_threshold,
    chart_full_mark: BDI2_TEMPLATE.chart_full_mark,
    is_active: true,
    interpretations: null,
  };
}

export default BDI2_TEMPLATE;

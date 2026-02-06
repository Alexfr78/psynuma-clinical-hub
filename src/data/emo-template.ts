// EMO - Entrevista sobre la Historia de la Regulación Emocional
// Desarrollada por Anabel González

// Tipos de respuesta
export type EMOItemType = 'open' | 'multiselect' | 'checkbox_list' | 'figure_evaluation' | 'moments_list' | 'adjectives_table';

export interface EMOItem {
  index: number;
  section: 1 | 2 | 3;
  type: EMOItemType;
  text: string;
  description?: string;
  options?: string[];
  isFigureItem?: boolean;
  isRepeatable?: boolean;
}

// Emociones problemáticas (Sección 1)
export const PROBLEMATIC_EMOTIONS = [
  'Aburrimiento', 'Admiración', 'Apatía', 'Asco', 'Calma', 'Cansancio',
  'Cariño', 'Celos', 'Disfrute', 'Esfuerzo', 'Euforia', 'Gratitud',
  'Paciencia', 'Incertidumbre', 'Miedo', 'Optimismo', 'Rechazo',
  'Satisfacción', 'Enfado', 'Envidia', 'Soledad', 'Tristeza',
  'Vergüenza', 'Dolor', 'Seguridad'
];

// Tendencias regulatorias principales (11 opciones)
export const REGULATORY_TENDENCIES = [
  { id: 'T1', text: 'Evito sentir algunas cosas', category: 'hipoactivacion' },
  { id: 'T2', text: 'Tiendo a suprimir o anular determinadas emociones', category: 'hipoactivacion' },
  { id: 'T3', text: 'Algunas de mis emociones suelen desbordarse', category: 'hiperactivacion' },
  { id: 'T4', text: 'Trato de controlar mis emociones todo lo que puedo', category: 'control' },
  { id: 'T5', text: 'A veces me vienen emociones que no me parecen mías', category: 'disregulacion' },
  { id: 'T6', text: 'Quisiera sentir más de lo que siento', category: 'hipoactivacion' },
  { id: 'T7', text: 'Tiendo a contagiarme de las emociones de los demás', category: 'hiperactivacion' },
  { id: 'T8', text: 'Mis emociones están siempre a flor de piel', category: 'hiperactivacion' },
  { id: 'T9', text: 'Mis emociones son demasiado intensas', category: 'hiperactivacion' },
  { id: 'T10', text: 'Soy poco emocional, o eso me dicen', category: 'hipoactivacion' },
  { id: 'T11', text: 'Me enfado conmigo mismo por sentir determinadas emociones', category: 'autocritica' },
];

// Tendencias adicionales (6 opciones)
export const ADDITIONAL_TENDENCIES = [
  { id: 'T12', text: 'A veces me avergüenzo de lo que puedo llegar a sentir', category: 'autocritica' },
  { id: 'T13', text: 'Puede cambiar de un momento a otro lo que siento', category: 'disregulacion' },
  { id: 'T14', text: 'En general no sé muy bien lo que siento', category: 'disregulacion' },
  { id: 'T15', text: 'Siento cosas que no debería de sentir', category: 'autocritica' },
  { id: 'T16', text: 'Me siento como anestesiado a nivel emocional', category: 'hipoactivacion' },
  { id: 'T17', text: 'Le doy vueltas y vueltas a cómo me siento', category: 'rumiacion' },
];

export const ALL_TENDENCIES = [...REGULATORY_TENDENCIES, ...ADDITIONAL_TENDENCIES];

// Categorías de tendencias para scoring
export const TENDENCY_CATEGORIES = {
  hipoactivacion: {
    label: 'Hipoactivación',
    description: 'Evitación, supresión y anestesia emocional',
    tendencies: ['T1', 'T2', 'T6', 'T10', 'T16'],
  },
  hiperactivacion: {
    label: 'Hiperactivación',
    description: 'Desbordamiento, intensidad y contagio emocional',
    tendencies: ['T3', 'T7', 'T8', 'T9'],
  },
  disregulacion: {
    label: 'Disregulación',
    description: 'Emociones ajenas, cambios bruscos, alexitimia',
    tendencies: ['T5', 'T13', 'T14'],
  },
  autocritica: {
    label: 'Autocrítica',
    description: 'Enfado, vergüenza y culpa por emociones',
    tendencies: ['T11', 'T12', 'T15'],
  },
  rumiacion: {
    label: 'Rumiación',
    description: 'Pensamiento repetitivo sobre emociones',
    tendencies: ['T17'],
  },
  control: {
    label: 'Control excesivo',
    description: 'Necesidad de controlar las emociones',
    tendencies: ['T4'],
  },
};

// Sentimientos generados por figuras
export const FIGURE_FEELINGS = {
  positive: [
    'Entendido/a', 'Aceptado/a', 'Valorado/a', 'Especial', 
    'Importante', 'Protegido/a', 'Apoyado/a', 'Seguro/a'
  ],
  negative: [
    'Rechazado/a', 'Atemorizado/a', 'Inseguro/a', 'Invisible',
    'Avergonzado/a', 'Humillado/a', 'Traicionado/a', 'Inútil',
    'Ridículo/a', 'Culpable'
  ],
};

export const ALL_FIGURE_FEELINGS = [...FIGURE_FEELINGS.positive, ...FIGURE_FEELINGS.negative];

// Reacciones parentales desadaptativas
export const MALADAPTIVE_REACTIONS = [
  'Ignorar mis emociones',
  'Castigar o criticar mi expresión emocional',
  'Minimizar lo que sentía',
  'Hacerme responsable de sus emociones',
  'Responder con hostilidad o agresividad',
  'Abandonarme emocionalmente cuando lo necesitaba',
  'Respuestas impredecibles o incoherentes',
  'Burlarse de mis emociones',
  'Compararme negativamente con otros',
  'Invalidar mis experiencias emocionales',
];

// Estructura de items del EMO
export const EMO_ITEMS: EMOItem[] = [
  // SECCIÓN 1: Regulación Emocional Actual
  {
    index: 1,
    section: 1,
    type: 'open',
    text: '¿Cómo describirías tu modo general de regular tus emociones?',
    description: 'Describe cómo sueles manejar lo que sientes en tu día a día.',
  },
  {
    index: 2,
    section: 1,
    type: 'open',
    text: '¿Tienes dificultad para sentir determinadas emociones?',
    description: 'Algunas personas tienen dificultad para sentir ciertas emociones. ¿Te ocurre esto?',
  },
  {
    index: 3,
    section: 1,
    type: 'multiselect',
    text: 'Selecciona las emociones que te resultan problemáticas o difíciles de manejar',
    options: PROBLEMATIC_EMOTIONS,
  },
  {
    index: 4,
    section: 1,
    type: 'checkbox_list',
    text: 'Indica cuáles de las siguientes afirmaciones se aplican a ti',
    options: REGULATORY_TENDENCIES.map(t => t.text),
  },
  {
    index: 5,
    section: 1,
    type: 'checkbox_list',
    text: 'Indica si alguna de estas otras afirmaciones también te describe',
    options: ADDITIONAL_TENDENCIES.map(t => t.text),
  },
  {
    index: 6,
    section: 1,
    type: 'open',
    text: '¿Desde cuándo recuerdas tener estas dificultades con tus emociones?',
    description: 'Intenta situar temporalmente el origen de estos patrones.',
  },
  {
    index: 7,
    section: 1,
    type: 'open',
    text: '¿Ha habido algún periodo en que estos problemas empeoraran?',
    description: 'Describe si hubo momentos vitales donde las dificultades aumentaron.',
  },

  // SECCIÓN 2: Figuras Reguladoras
  {
    index: 8,
    section: 2,
    type: 'open',
    text: '¿Con quién o quiénes te criaste principalmente?',
    description: 'Indica las personas que estuvieron más presentes en tu infancia.',
  },
  {
    index: 9,
    section: 2,
    type: 'open',
    text: '¿Hubo cambios significativos en la convivencia durante tu infancia/adolescencia?',
    description: 'Separaciones, mudanzas, cambios de cuidadores, etc.',
  },
  {
    index: 10,
    section: 2,
    type: 'open',
    text: '¿Hubo figuras importantes fuera de la familia?',
    description: 'Profesores, vecinos, familiares no convivientes, etc.',
  },
  {
    index: 11,
    section: 2,
    type: 'open',
    text: '¿Hubo cuidadores contratados (niñeras, au-pairs, etc.)?',
  },
  {
    index: 12,
    section: 2,
    type: 'open',
    text: '¿Pasaste tiempo en internados o instituciones?',
  },
  {
    index: 13,
    section: 2,
    type: 'open',
    text: '¿Fuiste adoptado/a o estuviste en acogida?',
  },
  {
    index: 14,
    section: 2,
    type: 'open',
    text: '¿Hay otras figuras relevantes que no hayamos mencionado?',
  },
  {
    index: 15,
    section: 2,
    type: 'open',
    text: '¿Qué figuras tuvieron una influencia positiva en tu regulación emocional?',
    description: 'Personas que te ayudaron a sentirte mejor, a calmarte, a entenderte.',
  },
  {
    index: 16,
    section: 2,
    type: 'open',
    text: '¿Qué figuras tuvieron una influencia negativa en tu regulación emocional?',
    description: 'Personas cuya presencia te desregulaba o te hacía sentir peor.',
  },
  {
    index: 17,
    section: 2,
    type: 'open',
    text: '¿Hubo figuras ausentes emocionalmente aunque estuvieran físicamente presentes?',
  },
  {
    index: 18,
    section: 2,
    type: 'moments_list',
    text: 'Describe hasta 10 momentos de regulación compartida positiva que recuerdes',
    description: 'Momentos en que alguien te ayudó a regular una emoción difícil o compartió contigo una emoción positiva.',
  },

  // SECCIÓN 3: Evaluación por Figura (template para repetir por cada figura)
  {
    index: 101,
    section: 3,
    type: 'open',
    text: 'Nombre o identificación de la figura',
    isFigureItem: true,
  },
  {
    index: 102,
    section: 3,
    type: 'open',
    text: 'Relación contigo (madre, padre, abuela, etc.)',
    isFigureItem: true,
  },
  {
    index: 103,
    section: 3,
    type: 'open',
    text: '¿Cuál es tu primer recuerdo con esta persona?',
    isFigureItem: true,
  },
  {
    index: 104,
    section: 3,
    type: 'open',
    text: '¿Cuál era la expresión típica de su cara?',
    isFigureItem: true,
  },
  {
    index: 105,
    section: 3,
    type: 'open',
    text: '¿Cómo es tu relación actual con esta persona?',
    isFigureItem: true,
  },
  {
    index: 106,
    section: 3,
    type: 'open',
    text: 'Si esta persona ya no está, ¿cómo reaccionaste ante su pérdida?',
    isFigureItem: true,
  },
  {
    index: 107,
    section: 3,
    type: 'adjectives_table',
    text: 'Describe a esta persona con 5 adjetivos y un ejemplo para cada uno',
    isFigureItem: true,
  },
  {
    index: 108,
    section: 3,
    type: 'open',
    text: '¿Cómo reaccionaba esta persona cuando tú te sentías mal?',
    isFigureItem: true,
  },
  {
    index: 109,
    section: 3,
    type: 'open',
    text: '¿Cómo reaccionaba ante tus éxitos? ¿Y ante tus fracasos?',
    isFigureItem: true,
  },
  {
    index: 110,
    section: 3,
    type: 'open',
    text: '¿Te ayudó en situaciones importantes de tu vida? Describe alguna.',
    isFigureItem: true,
  },
  {
    index: 111,
    section: 3,
    type: 'multiselect',
    text: 'Selecciona los sentimientos que esta persona generaba en ti',
    options: ALL_FIGURE_FEELINGS,
    isFigureItem: true,
  },
  {
    index: 112,
    section: 3,
    type: 'open',
    text: '¿Qué emoción llevaba peor esta persona (en sí misma)?',
    isFigureItem: true,
  },
  {
    index: 113,
    section: 3,
    type: 'open',
    text: '¿Qué emoción tuya llevaba peor ver o manejar?',
    isFigureItem: true,
  },
  {
    index: 114,
    section: 3,
    type: 'checkbox_list',
    text: 'Indica las reacciones desadaptativas que observaste en esta figura',
    options: MALADAPTIVE_REACTIONS,
    isFigureItem: true,
  },
  {
    index: 115,
    section: 3,
    type: 'open',
    text: '¿Recibías ayuda física de esta persona? (abrazos, contacto, cuidados)',
    isFigureItem: true,
  },
  {
    index: 116,
    section: 3,
    type: 'open',
    text: '¿Recibías ayuda emocional? Describe un ejemplo.',
    isFigureItem: true,
  },
  {
    index: 117,
    section: 3,
    type: 'open',
    text: 'Comentarios adicionales sobre esta figura',
    isFigureItem: true,
  },
];

// Labels para factores EMO en visualización
export const EMO_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  problematic_emotions_count: { label: 'Emociones Problemáticas', description: 'Número de emociones identificadas como difíciles' },
  tendencies_count: { label: 'Tendencias Disfuncionales', description: 'Número de patrones de regulación problemáticos' },
  hipoactivacion: { label: 'Hipoactivación', description: 'Evitación y supresión emocional' },
  hiperactivacion: { label: 'Hiperactivación', description: 'Intensidad y desbordamiento emocional' },
  disregulacion: { label: 'Disregulación', description: 'Dificultad para identificar y gestionar emociones' },
  autocritica: { label: 'Autocrítica', description: 'Juicio negativo sobre las propias emociones' },
  rumiacion: { label: 'Rumiación', description: 'Pensamiento repetitivo sobre emociones' },
  control: { label: 'Control Excesivo', description: 'Necesidad de controlar las emociones' },
  positive_moments_count: { label: 'Momentos Regulatorios', description: 'Experiencias positivas de regulación compartida' },
  positive_feelings_avg: { label: 'Sentimientos Positivos', description: 'Promedio de sentimientos positivos por figura' },
  negative_feelings_avg: { label: 'Sentimientos Negativos', description: 'Promedio de sentimientos negativos por figura' },
  maladaptive_reactions_avg: { label: 'Reacciones Desadaptativas', description: 'Promedio de conductas parentales disfuncionales' },
};

export const EMO_FACTOR_ORDER = [
  'hipoactivacion', 'hiperactivacion', 'disregulacion', 
  'autocritica', 'rumiacion', 'control'
];

// Función para generar los datos de plantilla para insertar en BD
export function getEMOTemplateData() {
  return {
    code: 'EMO',
    name: 'EMO - Entrevista de Regulación Emocional',
    description: 'Entrevista semi-estructurada para evaluar patrones de regulación emocional, historia de figuras reguladoras y calidad de las relaciones de apego temprano. Desarrollada por Anabel González.',
    version: 1,
    items: EMO_ITEMS.map(item => ({
      index: item.index,
      text: item.text,
      description: item.description,
      type: item.type,
      section: item.section,
      options: item.options,
      isFigureItem: item.isFigureItem,
    })),
    scoring: {
      problematic_emotions: { items: [3], label: 'Emociones problemáticas' },
      tendencies: { items: [4, 5], label: 'Tendencias regulatorias' },
      regulatory_history: { items: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], label: 'Historia de figuras' },
      positive_moments: { items: [18], label: 'Momentos de regulación positiva' },
      figure_evaluation: { items: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117], label: 'Evaluación de figuras' },
    },
    instructions: `Esta es una entrevista semi-estructurada sobre tu historia de regulación emocional. 

No hay respuestas correctas o incorrectas. Responde con la mayor honestidad posible, describiendo tu experiencia tal como la recuerdas.

La entrevista tiene tres secciones:
1. Tu regulación emocional actual
2. Las figuras que fueron importantes en tu desarrollo emocional
3. Una evaluación detallada de cada figura relevante

Tómate el tiempo que necesites para reflexionar sobre cada pregunta.`,
    interpretations: null,
    response_min: 0,
    response_max: 100, // No aplica realmente, pero necesario para el schema
    flag_threshold: 0,
    chart_full_mark: 5, // Para el gráfico radar de categorías de tendencias
    is_active: true,
  };
}

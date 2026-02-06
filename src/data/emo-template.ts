// EMO - Entrevista sobre la Historia de la Regulación Emocional
// Desarrollada por Anabel González - Versión Digital Autoadministrada

// === TIPOS ===
export type EMOItemType = 
  | 'textarea' 
  | 'checkbox_group' 
  | 'text_field' 
  | 'emotion_matrix' 
  | 'adjectives_table';

export interface EMOItem {
  id: string;
  section: 1 | 2 | 3;
  type: EMOItemType;
  label: string;
  description?: string;
  options?: string[];
  required?: boolean;
  isFigureItem?: boolean;
}

// === SECCIÓN 1: REGULACIÓN EMOCIONAL GENERAL ===

// 1.2 Emociones problemáticas (checkbox)
export const PROBLEMATIC_EMOTIONS = [
  'Aburrimiento', 'Admiración', 'Apatía', 'Asco', 'Calma', 'Cansancio',
  'Cariño', 'Celos', 'Disfrute', 'Enfado', 'Euforia', 'Envidia',
  'Gratitud', 'Incertidumbre', 'Miedo', 'Optimismo', 'Paciencia',
  'Rechazo', 'Satisfacción', 'Seguridad', 'Soledad', 'Tristeza',
  'Vergüenza', 'Dolor'
];

// 1.3 Patrones de regulación (checkbox)
export const REGULATORY_PATTERNS = [
  { id: 'P1', text: 'Evito sentir algunas emociones', category: 'supresion' },
  { id: 'P2', text: 'Suelo suprimir emociones', category: 'supresion' },
  { id: 'P3', text: 'Mis emociones se desbordan', category: 'hiperactivacion' },
  { id: 'P4', text: 'Intento controlarlas constantemente', category: 'control' },
  { id: 'P5', text: 'A veces siento emociones que no parecen mías', category: 'desconexion' },
  { id: 'P6', text: 'Me gustaría sentir más de lo que siento', category: 'hipoactivacion' },
  { id: 'P7', text: 'Me contagio de emociones ajenas', category: 'contagio' },
  { id: 'P8', text: 'Emociones muy intensas', category: 'hiperactivacion' },
  { id: 'P9', text: 'Soy poco emocional', category: 'hipoactivacion' },
  { id: 'P10', text: 'Me enfado conmigo por sentir', category: 'autocritica' },
  { id: 'P11', text: 'Me avergüenzo de lo que siento', category: 'verguenza' },
  { id: 'P12', text: 'Cambios emocionales bruscos', category: 'desregulacion' },
  { id: 'P13', text: 'No sé bien qué siento', category: 'confusion' },
  { id: 'P14', text: 'Me siento anestesiado emocionalmente', category: 'hipoactivacion' },
  { id: 'P15', text: 'Le doy muchas vueltas a mis emociones', category: 'rumiacion' },
];

// === SECCIÓN 2: FIGURAS REGULADORAS ===

// Sentimientos vividos con figuras
export const FIGURE_FEELINGS = {
  positive: [
    'Entendido/a', 'Aceptado/a', 'Valorado/a', 'Protegido/a', 
    'Apoyado/a', 'Seguro/a', 'Especial'
  ],
  negative: [
    'Rechazado/a', 'Invisible', 'Avergonzado/a', 'Humillado/a',
    'Inseguro/a', 'Traicionado/a', 'Culpable', 'Inútil', 'Ridículo/a'
  ],
};

export const ALL_FIGURE_FEELINGS = [...FIGURE_FEELINGS.positive, ...FIGURE_FEELINGS.negative];

// Emociones para la matriz de tolerancia
export const TOLERANCE_EMOTIONS = [
  'Alegría', 'Tristeza', 'Rabia', 'Miedo', 'Vergüenza', 'Asco', 'Preocupación'
];

// Opciones de tolerancia por emoción
export const TOLERANCE_OPTIONS = [
  'La mostraba frecuentemente',
  'Rara vez la mostraba',
  'Aceptaba que yo la sintiera',
  'Le molestaba que yo la sintiera'
];

// Respuestas típicas de la figura
export const TYPICAL_RESPONSES = [
  'Me decía que no me pusiera así',
  'Lo minimizaba',
  'Se enfadaba',
  'Me avergonzaba',
  'Se entristecía en exceso',
  'Se agobiaba',
  'Me ignoraba',
  'No se daba cuenta',
  'Me hacía sentir culpable'
];

// === CATEGORÍAS PARA SCORING ===
export const PATTERN_CATEGORIES = {
  supresion: {
    label: 'Supresión emocional',
    description: 'Tendencia a evitar o suprimir emociones',
    patterns: ['P1', 'P2'],
  },
  hiperactivacion: {
    label: 'Hiperactivación emocional',
    description: 'Emociones intensas y desbordantes',
    patterns: ['P3', 'P8'],
  },
  hipoactivacion: {
    label: 'Hipoactivación/Anestesia',
    description: 'Desconexión o baja emocionalidad',
    patterns: ['P6', 'P9', 'P14'],
  },
  desconexion: {
    label: 'Desconexión',
    description: 'Emociones que parecen ajenas',
    patterns: ['P5'],
  },
  contagio: {
    label: 'Contagio emocional',
    description: 'Absorción de emociones de otros',
    patterns: ['P7'],
  },
  control: {
    label: 'Control excesivo',
    description: 'Necesidad de controlar las emociones',
    patterns: ['P4'],
  },
  autocritica: {
    label: 'Autocrítica',
    description: 'Enfado consigo mismo por sentir',
    patterns: ['P10'],
  },
  verguenza: {
    label: 'Vergüenza emocional',
    description: 'Vergüenza por las propias emociones',
    patterns: ['P11'],
  },
  desregulacion: {
    label: 'Cambios bruscos',
    description: 'Variabilidad emocional impredecible',
    patterns: ['P12'],
  },
  confusion: {
    label: 'Confusión emocional',
    description: 'Dificultad para identificar emociones',
    patterns: ['P13'],
  },
  rumiacion: {
    label: 'Rumiación',
    description: 'Pensamiento repetitivo sobre emociones',
    patterns: ['P15'],
  },
};

// Perfiles de regulación predominante
export const REGULATION_PROFILES = {
  supresion: 'Supresión emocional',
  hiperactivacion: 'Hiperactivación emocional',
  desconexion: 'Desconexión/Anestesia',
  confusion: 'Confusión emocional',
  contagio: 'Contagio emocional',
};

// Riesgos relacionales tempranos
export const RELATIONAL_RISKS = {
  baja_coregulacion: 'Baja co-regulación',
  rechazo_emocional: 'Rechazo emocional',
  verguenza_aprendida: 'Vergüenza emocional aprendida',
  invalidacion: 'Invalidación afectiva',
  hipervigilancia: 'Hipervigilancia emocional',
};

// Estilos de apego orientativos
export const ATTACHMENT_STYLES = {
  secure: 'Seguro',
  anxious: 'Ansioso',
  avoidant: 'Evitativo',
  disorganized: 'Desorganizado',
};

// === ESTRUCTURA DE ITEMS ===

// Items de la Sección 1
export const SECTION_1_ITEMS: EMOItem[] = [
  {
    id: 's1_description',
    section: 1,
    type: 'textarea',
    label: '¿Cómo definirías en general tu forma de gestionar tus emociones?',
    description: 'Describe cómo sueles manejar lo que sientes en tu día a día.',
    required: true,
  },
  {
    id: 's1_difficult_emotions',
    section: 1,
    type: 'checkbox_group',
    label: 'Selecciona las emociones que te resultan difíciles de manejar',
    description: 'Marca todas las que apliquen a ti.',
    options: PROBLEMATIC_EMOTIONS,
  },
  {
    id: 's1_patterns',
    section: 1,
    type: 'checkbox_group',
    label: 'Indica cuáles de las siguientes afirmaciones se aplican a ti',
    options: REGULATORY_PATTERNS.map(p => p.text),
  },
  {
    id: 's1_since_when',
    section: 1,
    type: 'text_field',
    label: '¿Te ocurre desde siempre o empezó en una etapa concreta?',
    description: 'Intenta situar temporalmente el origen de estos patrones.',
  },
  {
    id: 's1_worsening_periods',
    section: 1,
    type: 'text_field',
    label: '¿Hubo periodos donde empeoró?',
    description: 'Describe si hubo momentos vitales donde las dificultades aumentaron.',
  },
];

// Items de la Sección 2 (template para cada figura)
export const FIGURE_TEMPLATE_ITEMS: EMOItem[] = [
  {
    id: 'fig_name',
    section: 2,
    type: 'text_field',
    label: 'Nombre o rol',
    description: 'Ej: madre, padre, abuela, cuidador principal, pareja...',
    required: true,
    isFigureItem: true,
  },
  {
    id: 'fig_current_relation',
    section: 2,
    type: 'text_field',
    label: 'Relación actual con esta persona',
    isFigureItem: true,
  },
  {
    id: 'fig_first_memory',
    section: 2,
    type: 'textarea',
    label: 'Describe el primer recuerdo que tengas con esta persona',
    isFigureItem: true,
  },
  {
    id: 'fig_adjectives',
    section: 2,
    type: 'adjectives_table',
    label: 'Describe a esta persona con 5 adjetivos y un ejemplo para cada uno',
    isFigureItem: true,
  },
  {
    id: 'fig_reaction_distress',
    section: 2,
    type: 'textarea',
    label: '¿Cómo reaccionaba cuando te sentías mal?',
    isFigureItem: true,
  },
  {
    id: 'fig_reaction_success_failure',
    section: 2,
    type: 'textarea',
    label: '¿Cómo reaccionaba ante tus éxitos? ¿Y ante tus fracasos?',
    isFigureItem: true,
  },
  {
    id: 'fig_feelings',
    section: 2,
    type: 'checkbox_group',
    label: 'Sentimientos que esta persona generaba en ti',
    options: ALL_FIGURE_FEELINGS,
    isFigureItem: true,
  },
  {
    id: 'fig_significant_emotion',
    section: 2,
    type: 'text_field',
    label: '¿Cuál fue la emoción más significativa que viviste con esta figura?',
    description: 'Describe brevemente un ejemplo.',
    isFigureItem: true,
  },
  {
    id: 'fig_emotion_tolerance',
    section: 2,
    type: 'emotion_matrix',
    label: 'Tolerancia emocional de esta figura',
    description: 'Indica cómo manejaba cada emoción.',
    isFigureItem: true,
  },
  {
    id: 'fig_worst_tolerated',
    section: 2,
    type: 'text_field',
    label: '¿Qué emoción tuya llevaba peor ver o manejar?',
    description: 'Describe un ejemplo si es posible.',
    isFigureItem: true,
  },
  {
    id: 'fig_typical_responses',
    section: 2,
    type: 'checkbox_group',
    label: 'Respuestas típicas de esta figura cuando mostrabas emociones',
    options: TYPICAL_RESPONSES,
    isFigureItem: true,
  },
  {
    id: 'fig_physical_support',
    section: 2,
    type: 'textarea',
    label: '¿Recibías apoyo físico de esta persona cuando estabas mal?',
    description: 'Abrazos, contacto físico, cuidados...',
    isFigureItem: true,
  },
  {
    id: 'fig_emotional_support',
    section: 2,
    type: 'textarea',
    label: '¿Recibías apoyo emocional cuando estabas mal?',
    description: 'Describe un ejemplo si es posible.',
    isFigureItem: true,
  },
];

// === LABELS PARA VISUALIZACIÓN ===
export const EMO_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  problematic_emotions_count: { label: 'Emociones Problemáticas', description: 'Número de emociones identificadas como difíciles' },
  patterns_count: { label: 'Patrones Disfuncionales', description: 'Número de patrones de regulación problemáticos' },
  supresion: { label: 'Supresión', description: 'Evitación y supresión emocional' },
  hiperactivacion: { label: 'Hiperactivación', description: 'Intensidad y desbordamiento emocional' },
  hipoactivacion: { label: 'Hipoactivación', description: 'Anestesia o baja emocionalidad' },
  desconexion: { label: 'Desconexión', description: 'Emociones que parecen ajenas' },
  contagio: { label: 'Contagio', description: 'Absorción de emociones de otros' },
  control: { label: 'Control', description: 'Necesidad de controlar las emociones' },
  autocritica: { label: 'Autocrítica', description: 'Enfado consigo mismo por sentir' },
  verguenza: { label: 'Vergüenza', description: 'Vergüenza por las propias emociones' },
  desregulacion: { label: 'Cambios bruscos', description: 'Variabilidad emocional' },
  confusion: { label: 'Confusión', description: 'Dificultad para identificar emociones' },
  rumiacion: { label: 'Rumiación', description: 'Pensamiento repetitivo' },
  positive_feelings_count: { label: 'Sentimientos Positivos', description: 'Experiencias positivas con figuras' },
  negative_feelings_count: { label: 'Sentimientos Negativos', description: 'Experiencias negativas con figuras' },
  typical_responses_count: { label: 'Respuestas Desadaptativas', description: 'Conductas parentales disfuncionales' },
};

export const EMO_FACTOR_ORDER = [
  'supresion', 'hiperactivacion', 'hipoactivacion', 
  'desconexion', 'confusion', 'rumiacion', 'control'
];

// === FUNCIÓN PARA GENERAR DATOS DE PLANTILLA ===
export function getEMOTemplateData() {
  return {
    code: 'EMO',
    name: 'EMO - Entrevista de Gestión Emocional',
    description: 'Entrevista digital autoadministrada para evaluar patrones de regulación emocional, historia de figuras reguladoras y calidad de las relaciones de apego temprano. Basada en el trabajo de Anabel González.',
    version: 2,
    items: [
      ...SECTION_1_ITEMS,
      ...FIGURE_TEMPLATE_ITEMS,
    ],
    scoring: {
      section1: { items: SECTION_1_ITEMS.map(i => i.id), label: 'Regulación emocional actual' },
      figures: { items: FIGURE_TEMPLATE_ITEMS.map(i => i.id), label: 'Evaluación de figuras' },
    },
    instructions: `Esta es la Entrevista de Gestión Emocional (EMO), una evaluación sobre tu historia de regulación emocional.

No hay respuestas correctas o incorrectas. Responde con la mayor honestidad posible, describiendo tu experiencia tal como la recuerdas.

La entrevista tiene dos partes:
1. Tu regulación emocional actual
2. Las figuras que fueron importantes en tu desarrollo emocional (podrás añadir tantas como necesites)

Tus respuestas se guardan automáticamente. Puedes pausar y continuar cuando quieras.

Tómate el tiempo que necesites para reflexionar sobre cada pregunta.`,
    interpretations: null,
    response_min: 0,
    response_max: 100,
    flag_threshold: 0,
    chart_full_mark: 5,
    is_active: true,
  };
}

// === TIPOS PARA RESPUESTAS ===
export interface EMOFigureData {
  id: string;
  name: string;
  current_relation?: string;
  first_memory?: string;
  adjectives?: { adjective: string; example: string }[];
  reaction_distress?: string;
  reaction_success_failure?: string;
  feelings?: string[];
  significant_emotion?: string;
  emotion_tolerance?: Record<string, string[]>;
  worst_tolerated?: string;
  typical_responses?: string[];
  physical_support?: string;
  emotional_support?: string;
}

export interface EMOAnswers {
  // Section 1
  s1_description?: string;
  s1_difficult_emotions?: string[];
  s1_patterns?: string[];
  s1_since_when?: string;
  s1_worsening_periods?: string;
  // Section 2 - Dynamic figures
  figures?: EMOFigureData[];
}

export interface EMOScores {
  problematic_emotions_count: number;
  patterns_count: number;
  supresion: number;
  hiperactivacion: number;
  hipoactivacion: number;
  desconexion: number;
  contagio: number;
  control: number;
  autocritica: number;
  verguenza: number;
  desregulacion: number;
  confusion: number;
  rumiacion: number;
  figures_count: number;
  positive_feelings_total: number;
  negative_feelings_total: number;
  typical_responses_total: number;
}

// === FUNCIÓN PARA CALCULAR SCORES ===
export function calculateEMOScores(answers: EMOAnswers): EMOScores {
  const patternMap: Record<string, string> = {};
  REGULATORY_PATTERNS.forEach(p => {
    patternMap[p.text] = p.category;
  });

  const selectedPatterns = answers.s1_patterns || [];
  
  // Count by category
  const categoryCounts: Record<string, number> = {
    supresion: 0,
    hiperactivacion: 0,
    hipoactivacion: 0,
    desconexion: 0,
    contagio: 0,
    control: 0,
    autocritica: 0,
    verguenza: 0,
    desregulacion: 0,
    confusion: 0,
    rumiacion: 0,
  };

  selectedPatterns.forEach(pattern => {
    const category = patternMap[pattern];
    if (category && categoryCounts[category] !== undefined) {
      categoryCounts[category]++;
    }
  });

  // Figure-level aggregations
  const figures = answers.figures || [];
  let positiveFeelings = 0;
  let negativeFeelings = 0;
  let typicalResponses = 0;

  figures.forEach(fig => {
    const feelings = fig.feelings || [];
    positiveFeelings += feelings.filter(f => FIGURE_FEELINGS.positive.includes(f)).length;
    negativeFeelings += feelings.filter(f => FIGURE_FEELINGS.negative.includes(f)).length;
    typicalResponses += (fig.typical_responses || []).length;
  });

  return {
    problematic_emotions_count: (answers.s1_difficult_emotions || []).length,
    patterns_count: selectedPatterns.length,
    ...categoryCounts,
    figures_count: figures.length,
    positive_feelings_total: positiveFeelings,
    negative_feelings_total: negativeFeelings,
    typical_responses_total: typicalResponses,
  };
}

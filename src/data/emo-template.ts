// EMO - Entrevista de Regulación Emocional
// Versión digital autoadministrada basada en la EMO original de Anabel González

// === TIPOS ===
export type EMOQuestionType = 
  | 'textarea' 
  | 'yes_no'
  | 'checkbox_group' 
  | 'text_field'
  | 'emotion_matrix'
  | 'adjectives_repeater'
  | 'coregulation_repeater';

export interface EMOQuestion {
  id: string;
  section: 1 | 2 | 3;
  type: EMOQuestionType;
  label: string;
  description?: string;
  options?: string[];
  required?: boolean;
  conditionalOn?: { questionId: string; value: string | string[] };
  isFigureField?: boolean;
  maxItems?: number;
}

// === SECCIÓN 1: REGULACIÓN EMOCIONAL ACTUAL ===

export const PROBLEMATIC_EMOTIONS = [
  'Aburrimiento', 'Admiración', 'Apatía', 'Asco', 'Calma', 'Cansancio',
  'Cariño', 'Celos', 'Disfrute', 'Enfado', 'Euforia', 'Envidia',
  'Gratitud', 'Incertidumbre', 'Miedo', 'Optimismo', 'Paciencia',
  'Rechazo', 'Satisfacción', 'Seguridad', 'Soledad', 'Tristeza',
  'Vergüenza', 'Dolor', 'Otro'
];

export const REGULATION_PATTERNS_1 = [
  'Evito sentir algunas cosas',
  'Tiendo a suprimir o anular determinadas emociones',
  'Algunas de mis emociones suelen desbordarse',
  'Trato de controlar mis emociones todo lo que puedo',
  'A veces me vienen emociones que no me parecen mías',
  'Quisiera sentir más de lo que siento',
  'Tiendo a contagiarme de las emociones de los demás',
  'Mis emociones están siempre a flor de piel',
  'Mis emociones son demasiado intensas',
  'Soy poco emocional, o eso me dicen',
  'Me enfado conmigo mismo por sentir determinadas emociones',
];

export const REGULATION_PATTERNS_2 = [
  'A veces me avergüenzo de lo que puedo llegar a sentir',
  'Puede cambiar de un momento a otro lo que siento',
  'En general no sé muy bien lo que siento',
  'Siento cosas que no debería sentir',
  'Me siento como anestesiado a nivel emocional',
  'Le doy vueltas y vueltas a cómo me siento',
  'Otro'
];

// === SECCIÓN 2: FIGURAS REGULADORAS (HISTORIA) ===
// Preguntas sobre contexto de crianza

// === SECCIÓN 3: EVALUACIÓN POR FIGURA ===

export const FIGURE_FEELINGS = [
  'Entendido', 'Rechazado', 'Aceptado', 'Atemorizado', 'Valorado', 
  'Inseguro', 'Invisible', 'Avergonzado', 'Especial', 'Humillado',
  'Importante', 'Traicionado', 'Inútil', 'Ridículo', 'Protegido',
  'Apoyado', 'Culpable', 'Seguro', 'Otro'
];

export const FIGURE_FEELINGS_POSITIVE = [
  'Entendido', 'Aceptado', 'Valorado', 'Especial', 'Importante', 
  'Protegido', 'Apoyado', 'Seguro'
];

export const FIGURE_FEELINGS_NEGATIVE = [
  'Rechazado', 'Atemorizado', 'Inseguro', 'Invisible', 'Avergonzado',
  'Humillado', 'Traicionado', 'Inútil', 'Ridículo', 'Culpable'
];

export const EMOTION_MATRIX_EMOTIONS = [
  'Alegría', 'Tristeza', 'Rabia', 'Miedo', 'Vergüenza', 'Asco', 'Preocupación'
];

export const EMOTION_MATRIX_COLUMNS = [
  'Era frecuente verla así',
  'Era raro verla así',
  'Aceptaba que yo estuviera así',
  'No le gustaba verme así'
];

export const FIGURE_REACTIONS = [
  'Me decía "no tienes que ponerte así"',
  'Me decía que no pasaba nada',
  'Se enfadaba',
  'Me avergonzaba por sentirme así',
  'Se disgustaba / se ponía triste si yo me sentía así',
  'Se preocupaba en exceso / se agobiaba',
  'Dejaba de hablarme o me ignoraba',
  'Ni se enteraba de cómo me sentía',
  'Me hacía sentir culpable por sentirme así',
  'Otro'
];

// === ESTRUCTURA DE PREGUNTAS ===

export const SECTION_1_QUESTIONS: EMOQuestion[] = [
  {
    id: 'emo_reg_general',
    section: 1,
    type: 'textarea',
    label: '¿Cómo describirías, en general, tu modo de regular tus emociones?',
    required: true,
  },
  {
    id: 'emo_dificultad_sentir',
    section: 1,
    type: 'yes_no',
    label: '¿Te cuesta sentir tus emociones como lo hacen otras personas?',
  },
  {
    id: 'emo_dificultad_sentir_explicacion',
    section: 1,
    type: 'textarea',
    label: 'Explícalo brevemente: ¿qué notas diferente en ti?',
    conditionalOn: { questionId: 'emo_dificultad_sentir', value: 'si' },
  },
  {
    id: 'emo_emociones_problematicas',
    section: 1,
    type: 'checkbox_group',
    label: '¿Con qué emociones o sentimientos tienes más problemas (notarlos, tolerarlos, regularlos o cuando los expresan otras personas)?',
    description: 'Marca las que te resulten más difíciles.',
    options: PROBLEMATIC_EMOTIONS,
  },
  {
    id: 'emo_emociones_problematicas_otro',
    section: 1,
    type: 'text_field',
    label: 'Indica cuál es "Otro".',
    conditionalOn: { questionId: 'emo_emociones_problematicas', value: ['Otro'] },
  },
  {
    id: 'emo_emociones_problematicas_por_que',
    section: 1,
    type: 'textarea',
    label: 'Si marcaste alguna emoción como difícil, explica brevemente por qué o qué te pasa con ellas.',
  },
  {
    id: 'emo_patrones_1',
    section: 1,
    type: 'checkbox_group',
    label: '¿Alguna de estas tendencias es frecuente en ti?',
    description: 'Marca todas las que encajen.',
    options: REGULATION_PATTERNS_1,
  },
  {
    id: 'emo_patrones_2',
    section: 1,
    type: 'checkbox_group',
    label: 'Marca también si alguna de estas afirmaciones te describe.',
    options: REGULATION_PATTERNS_2,
  },
  {
    id: 'emo_patrones_otro_texto',
    section: 1,
    type: 'textarea',
    label: 'Describe ese "Otro".',
    conditionalOn: { questionId: 'emo_patrones_2', value: ['Otro'] },
  },
  {
    id: 'emo_desde_cuando',
    section: 1,
    type: 'textarea',
    label: '¿Esto te pasa desde que recuerdas, o empezó en alguna etapa de tu vida?',
    description: 'Describe brevemente cómo eran las cosas entonces.',
  },
  {
    id: 'emo_empeoro',
    section: 1,
    type: 'yes_no',
    label: '¿Empeoró en alguna etapa?',
  },
  {
    id: 'emo_empeoro_cuando',
    section: 1,
    type: 'textarea',
    label: '¿Cuándo fue y cómo era tu vida en aquellos momentos?',
    conditionalOn: { questionId: 'emo_empeoro', value: 'si' },
  },
];

export const SECTION_2_QUESTIONS: EMOQuestion[] = [
  {
    id: 'emo_quienes_crianza',
    section: 2,
    type: 'textarea',
    label: '¿Cuáles fueron las personas con las que te criaste?',
    required: true,
  },
  {
    id: 'emo_cambio_convivencia',
    section: 2,
    type: 'yes_no',
    label: '¿Viviste siempre con ellos o cambió en alguna época la gente con la que viviste?',
  },
  {
    id: 'emo_cambio_convivencia_detalle',
    section: 2,
    type: 'textarea',
    label: 'Describe brevemente esos cambios.',
    conditionalOn: { questionId: 'emo_cambio_convivencia', value: 'si' },
  },
  {
    id: 'emo_figuras_fuera_familia',
    section: 2,
    type: 'yes_no',
    label: '¿Hubo figuras importantes en este sentido aparte de tu familia?',
  },
  {
    id: 'emo_figuras_fuera_familia_detalle',
    section: 2,
    type: 'textarea',
    label: '¿Quiénes? (por ejemplo profesor/a, amigo/a, pareja adolescente…)',
    conditionalOn: { questionId: 'emo_figuras_fuera_familia', value: 'si' },
  },
  {
    id: 'emo_cuidadores_contratados',
    section: 2,
    type: 'yes_no',
    label: '¿Estuviste a cargo de niñeras o cuidadores contratados en alguna etapa?',
  },
  {
    id: 'emo_cuidadores_tiempo',
    section: 2,
    type: 'textarea',
    label: 'Si es así, ¿cuánto tiempo pasabas con ellos?',
    conditionalOn: { questionId: 'emo_cuidadores_contratados', value: 'si' },
  },
  {
    id: 'emo_internado',
    section: 2,
    type: 'yes_no',
    label: '¿Estuviste alguna etapa de tu vida en algún internado o institución?',
  },
  {
    id: 'emo_internado_detalle',
    section: 2,
    type: 'textarea',
    label: 'Describe brevemente.',
    conditionalOn: { questionId: 'emo_internado', value: 'si' },
  },
  {
    id: 'emo_adopcion',
    section: 2,
    type: 'yes_no',
    label: '¿Fuiste adoptado/a o viviste con alguna familia de acogida?',
  },
  {
    id: 'emo_adopcion_detalle',
    section: 2,
    type: 'textarea',
    label: 'Describe brevemente.',
    conditionalOn: { questionId: 'emo_adopcion', value: 'si' },
  },
  {
    id: 'emo_figuras_positivas',
    section: 2,
    type: 'textarea',
    label: 'De las personas anteriores, ¿cuáles tuvieron influencia más positiva?',
  },
  {
    id: 'emo_figuras_negativas',
    section: 2,
    type: 'textarea',
    label: '¿Cuáles tuvieron influencia más negativa?',
  },
  {
    id: 'emo_figuras_ausentes',
    section: 2,
    type: 'textarea',
    label: '¿Qué figuras deberían haber estado ahí emocionalmente, pero no estuvieron?',
  },
  {
    id: 'emo_momentos_coregulacion',
    section: 2,
    type: 'coregulation_repeater',
    label: 'Escribe hasta 10 momentos en los que sintieras que alguien te ayudó con algún estado emocional (personas o animales).',
    maxItems: 10,
  },
];

export const FIGURE_FIELDS: EMOQuestion[] = [
  {
    id: 'figure_name',
    section: 3,
    type: 'text_field',
    label: 'Nombre o identificación de la figura',
    required: true,
    isFigureField: true,
  },
  {
    id: 'figure_relation',
    section: 3,
    type: 'text_field',
    label: 'Relación contigo (madre, padre, abuela, cuidador, etc.)',
    required: true,
    isFigureField: true,
  },
  {
    id: 'figure_first_memory',
    section: 3,
    type: 'textarea',
    label: 'Describe el primer recuerdo que tienes con esta persona.',
    isFigureField: true,
  },
  {
    id: 'figure_face_expression',
    section: 3,
    type: 'textarea',
    label: '¿Cuál era la expresión típica de su cara?',
    isFigureField: true,
  },
  {
    id: 'figure_still_in_life',
    section: 3,
    type: 'yes_no',
    label: '¿Esta persona forma parte de tu vida actualmente?',
    isFigureField: true,
  },
  {
    id: 'figure_current_relationship',
    section: 3,
    type: 'textarea',
    label: 'Si sigues teniendo relación, ¿cómo es esa relación ahora?',
    conditionalOn: { questionId: 'figure_still_in_life', value: 'si' },
    isFigureField: true,
  },
  {
    id: 'figure_loss_reaction',
    section: 3,
    type: 'textarea',
    label: 'Si no forma parte de tu vida: ¿por qué? ¿cómo reaccionaste ante esa pérdida y cómo reaccionó el entorno?',
    conditionalOn: { questionId: 'figure_still_in_life', value: 'no' },
    isFigureField: true,
  },
  {
    id: 'figure_adjectives',
    section: 3,
    type: 'adjectives_repeater',
    label: 'Escribe 5 adjetivos que describan tu relación con esta persona en tu infancia/adolescencia y un ejemplo de cada uno.',
    maxItems: 5,
    isFigureField: true,
  },
  {
    id: 'figure_when_bad',
    section: 3,
    type: 'textarea',
    label: '¿Cómo reaccionaba esta persona cuando tú te sentías mal o tenías un problema? Describe la secuencia.',
    isFigureField: true,
  },
  {
    id: 'figure_success_failure',
    section: 3,
    type: 'textarea',
    label: '¿Cómo reaccionaba ante tus éxitos o fracasos? (buenas notas, errores, corrección, etc.)',
    isFigureField: true,
  },
  {
    id: 'figure_help_important',
    section: 3,
    type: 'textarea',
    label: '¿Te ayudó en situaciones importantes en infancia/adolescencia? ¿Cómo?',
    isFigureField: true,
  },
  {
    id: 'figure_feelings_words',
    section: 3,
    type: 'checkbox_group',
    label: 'Marca las palabras que describan cómo te hizo sentir esta persona (aunque fuera ocasionalmente).',
    options: FIGURE_FEELINGS,
    isFigureField: true,
  },
  {
    id: 'figure_feelings_words_otro',
    section: 3,
    type: 'text_field',
    label: 'Describe "Otro".',
    conditionalOn: { questionId: 'figure_feelings_words', value: ['Otro'] },
    isFigureField: true,
  },
  {
    id: 'figure_most_important_word',
    section: 3,
    type: 'textarea',
    label: 'De las anteriores, ¿cuál es la palabra más importante en la relación con esta persona? Describe un ejemplo.',
    isFigureField: true,
  },
  {
    id: 'figure_emotion_matrix',
    section: 3,
    type: 'emotion_matrix',
    label: 'Para cada emoción, marca lo que encaje.',
    isFigureField: true,
  },
  {
    id: 'figure_worst_emotion_self',
    section: 3,
    type: 'textarea',
    label: '¿Cuál era la emoción que esta persona llevaba peor sentir (en sí misma)? Pon un ejemplo.',
    isFigureField: true,
  },
  {
    id: 'figure_worst_emotion_you',
    section: 3,
    type: 'textarea',
    label: '¿Cuál era la que llevaba peor que sintieras tú? Describe brevemente.',
    isFigureField: true,
  },
  {
    id: 'figure_reactions_to_your_emotion',
    section: 3,
    type: 'checkbox_group',
    label: 'Cuando tú sentías esa emoción que llevaba peor, ¿qué hacía? (marca todas las que ocurrieran)',
    options: FIGURE_REACTIONS,
    isFigureField: true,
  },
  {
    id: 'figure_reactions_otro',
    section: 3,
    type: 'text_field',
    label: 'Describe "Otro".',
    conditionalOn: { questionId: 'figure_reactions_to_your_emotion', value: ['Otro'] },
    isFigureField: true,
  },
  {
    id: 'figure_help_physical',
    section: 3,
    type: 'yes_no',
    label: '¿Te ayudaba a sentirte mejor cuando estabas físicamente mal?',
    isFigureField: true,
  },
  {
    id: 'figure_help_physical_how',
    section: 3,
    type: 'textarea',
    label: '¿De qué modo?',
    conditionalOn: { questionId: 'figure_help_physical', value: 'si' },
    isFigureField: true,
  },
  {
    id: 'figure_help_emotional',
    section: 3,
    type: 'textarea',
    label: '¿Te ayudaba a sentirte mejor cuando estabas emocionalmente mal? Describe una situación.',
    isFigureField: true,
  },
  {
    id: 'figure_more_comments',
    section: 3,
    type: 'textarea',
    label: '¿Hay algo más sobre esta persona que creas importante comentar?',
    isFigureField: true,
  },
];

// === INDICADORES AUTOMÁTICOS ===

export const REGULATION_INDICATORS = {
  supresion_evitacion: {
    label: 'Supresión/Evitación',
    patterns: [
      'Evito sentir algunas cosas',
      'Tiendo a suprimir o anular determinadas emociones',
      'Me siento como anestesiado a nivel emocional',
    ],
  },
  hiperactivacion_desborde: {
    label: 'Hiperactivación/Desborde',
    patterns: [
      'Algunas de mis emociones suelen desbordarse',
      'Mis emociones están siempre a flor de piel',
      'Mis emociones son demasiado intensas',
    ],
  },
  confusion_emocional: {
    label: 'Confusión emocional',
    patterns: [
      'En general no sé muy bien lo que siento',
    ],
  },
  rumiacion_emocional: {
    label: 'Rumiación emocional',
    patterns: [
      'Le doy vueltas y vueltas a cómo me siento',
    ],
  },
  contagio_emocional: {
    label: 'Contagio emocional',
    patterns: [
      'Tiendo a contagiarme de las emociones de los demás',
    ],
  },
  verguenza_autocritica: {
    label: 'Vergüenza/Auto-crítica emocional',
    patterns: [
      'A veces me avergüenzo de lo que puedo llegar a sentir',
      'Me enfado conmigo mismo por sentir determinadas emociones',
    ],
  },
};

export const RELATIONAL_INDICATORS = {
  invalidacion: {
    label: 'Invalidación',
    reactions: [
      'Me decía "no tienes que ponerte así"',
      'Me decía que no pasaba nada',
      'Dejaba de hablarme o me ignoraba',
    ],
  },
  verguenza_inducida: {
    label: 'Vergüenza inducida',
    reactions: [
      'Me avergonzaba por sentirme así',
    ],
  },
  culpa_inducida: {
    label: 'Culpa inducida',
    reactions: [
      'Me hacía sentir culpable por sentirme así',
    ],
  },
  rechazo_ausencia: {
    label: 'Rechazo/Ausencia',
    feelings: ['Rechazado', 'Invisible'],
    reactions: ['Dejaba de hablarme o me ignoraba', 'Ni se enteraba de cómo me sentía'],
  },
};

// === TIPOS PARA RESPUESTAS ===

export interface EMOCoregulationMoment {
  who: string;
  emotion: string;
  whatHelped: string;
}

export interface EMOAdjective {
  adjective: string;
  example: string;
}

export interface EMOFigureData {
  id: string;
  figure_name: string;
  figure_relation: string;
  figure_first_memory?: string;
  figure_face_expression?: string;
  figure_still_in_life?: 'si' | 'no';
  figure_current_relationship?: string;
  figure_loss_reaction?: string;
  figure_adjectives?: EMOAdjective[];
  figure_when_bad?: string;
  figure_success_failure?: string;
  figure_help_important?: string;
  figure_feelings_words?: string[];
  figure_feelings_words_otro?: string;
  figure_most_important_word?: string;
  figure_emotion_matrix?: Record<string, string[]>;
  figure_worst_emotion_self?: string;
  figure_worst_emotion_you?: string;
  figure_reactions_to_your_emotion?: string[];
  figure_reactions_otro?: string;
  figure_help_physical?: 'si' | 'no';
  figure_help_physical_how?: string;
  figure_help_emotional?: string;
  figure_more_comments?: string;
}

export interface EMOAnswers {
  // Section 1
  emo_reg_general?: string;
  emo_dificultad_sentir?: 'si' | 'no';
  emo_dificultad_sentir_explicacion?: string;
  emo_emociones_problematicas?: string[];
  emo_emociones_problematicas_otro?: string;
  emo_emociones_problematicas_por_que?: string;
  emo_patrones_1?: string[];
  emo_patrones_2?: string[];
  emo_patrones_otro_texto?: string;
  emo_desde_cuando?: string;
  emo_empeoro?: 'si' | 'no';
  emo_empeoro_cuando?: string;
  // Section 2
  emo_quienes_crianza?: string;
  emo_cambio_convivencia?: 'si' | 'no';
  emo_cambio_convivencia_detalle?: string;
  emo_figuras_fuera_familia?: 'si' | 'no';
  emo_figuras_fuera_familia_detalle?: string;
  emo_cuidadores_contratados?: 'si' | 'no';
  emo_cuidadores_tiempo?: string;
  emo_internado?: 'si' | 'no';
  emo_internado_detalle?: string;
  emo_adopcion?: 'si' | 'no';
  emo_adopcion_detalle?: string;
  emo_figuras_positivas?: string;
  emo_figuras_negativas?: string;
  emo_figuras_ausentes?: string;
  emo_momentos_coregulacion?: EMOCoregulationMoment[];
  // Section 3 - Dynamic figures
  figures?: EMOFigureData[];
}

export interface EMOIndicators {
  regulation: {
    id: string;
    label: string;
    detected: boolean;
    matchedPatterns: string[];
  }[];
  relational: {
    figureId: string;
    figureName: string;
    indicators: {
      id: string;
      label: string;
      detected: boolean;
    }[];
    positiveCount: number;
    negativeCount: number;
  }[];
}

// === FUNCIONES DE CÁLCULO ===

export function calculateEMOIndicators(answers: EMOAnswers): EMOIndicators {
  const allPatterns = [
    ...(answers.emo_patrones_1 || []),
    ...(answers.emo_patrones_2 || []),
  ];

  // Regulation indicators
  const regulation = Object.entries(REGULATION_INDICATORS).map(([id, config]) => {
    const matchedPatterns = config.patterns.filter(p => allPatterns.includes(p));
    return {
      id,
      label: config.label,
      detected: matchedPatterns.length > 0,
      matchedPatterns,
    };
  });

  // Relational indicators per figure
  const relational = (answers.figures || []).map(figure => {
    const feelings = figure.figure_feelings_words || [];
    const reactions = figure.figure_reactions_to_your_emotion || [];

    const indicators = Object.entries(RELATIONAL_INDICATORS).map(([id, config]) => {
      let detected = false;
      
      if ('reactions' in config) {
        detected = config.reactions.some(r => reactions.includes(r));
      }
      if ('feelings' in config && !detected) {
        detected = config.feelings.some(f => feelings.includes(f));
      }
      
      return {
        id,
        label: config.label,
        detected,
      };
    });

    const positiveCount = feelings.filter(f => FIGURE_FEELINGS_POSITIVE.includes(f)).length;
    const negativeCount = feelings.filter(f => FIGURE_FEELINGS_NEGATIVE.includes(f)).length;

    return {
      figureId: figure.id,
      figureName: figure.figure_name || figure.figure_relation || 'Sin nombre',
      indicators,
      positiveCount,
      negativeCount,
    };
  });

  return { regulation, relational };
}

// === TEMPLATE DATA ===

export function getEMOTemplateData() {
  return {
    code: 'EMO',
    name: 'EMO – Entrevista de Regulación Emocional',
    description: 'Entrevista semi-estructurada digital autoadministrada para explorar la historia de regulación emocional. Basada en la EMO original de Anabel González.',
    version: 3,
    items: [
      ...SECTION_1_QUESTIONS,
      ...SECTION_2_QUESTIONS,
      ...FIGURE_FIELDS,
    ],
    scoring: {
      section1: { items: SECTION_1_QUESTIONS.map(q => q.id), label: 'Regulación emocional actual' },
      section2: { items: SECTION_2_QUESTIONS.map(q => q.id), label: 'Historia de figuras reguladoras' },
      section3: { items: FIGURE_FIELDS.map(q => q.id), label: 'Evaluación por figura' },
    },
    instructions: `Esta entrevista semi-estructurada explora tu historia de regulación emocional. No hay respuestas correctas o incorrectas. Responde con la mayor honestidad posible, describiendo tu experiencia tal como la recuerdas.

Tómate el tiempo que necesites para reflexionar. Tus respuestas se guardan automáticamente.

La entrevista tiene tres partes:
1. Tu regulación emocional actual
2. Las figuras que fueron importantes en tu crianza
3. Evaluación detallada de cada figura relevante (podrás añadir tantas como necesites)`,
    interpretations: null,
    response_min: 0,
    response_max: 100,
    flag_threshold: 0,
    chart_full_mark: 5,
    is_active: true,
  };
}

// STAI - Cuestionario de Ansiedad Estado Rasgo
// Spielberger, Gorsuch & Lushene (1970)
// Adaptación española: TEA Ediciones

export interface STAIItem {
  index: number;
  text: string;
  scale: 'A_E' | 'A_R';
  reversed: boolean;
}

export interface STAITemplateData {
  code: string;
  name: string;
  description: string;
  version: number;
  response_min: number;
  response_max: number;
  flag_threshold: number;
  chart_full_mark: number;
  min_label: string;
  max_label: string;
  items: STAIItem[];
  scoring: {
    A_E: { items: number[]; label: string; description: string; reversedItems: number[] };
    A_R: { items: number[]; label: string; description: string; reversedItems: number[] };
  };
  instructions: string;
  interpretations: Record<string, { interpretation: string; intervention: string }>;
}

// Items invertidos por escala
export const STAI_REVERSED_ITEMS = {
  A_E: [1, 2, 5, 8, 10, 11, 15, 16, 19, 20], // Escala Estado
  A_R: [21, 26, 27, 30, 33, 36, 39],          // Escala Rasgo
};

// Puntos de corte (percentil 75 aproximado para población general española adulta)
export const STAI_CUTOFFS = {
  A_E: {
    low: { max: 19, label: 'Baja', color: 'green' },
    normal: { max: 30, label: 'Normal', color: 'blue' },
    moderate: { max: 40, label: 'Moderada', color: 'orange' },
    high: { max: 60, label: 'Alta', color: 'red' },
  },
  A_R: {
    low: { max: 19, label: 'Baja', color: 'green' },
    normal: { max: 30, label: 'Normal', color: 'blue' },
    moderate: { max: 40, label: 'Moderada', color: 'orange' },
    high: { max: 60, label: 'Alta', color: 'red' },
  },
};

// Baremos españoles aproximados (Spielberger et al., adaptación TEA)
export const STAI_NORMS = {
  // Varones adultos
  male: {
    A_E: { p25: 15, p50: 20, p75: 28, p90: 37 },
    A_R: { p25: 17, p50: 22, p75: 30, p90: 40 },
  },
  // Mujeres adultas
  female: {
    A_E: { p25: 18, p50: 24, p75: 32, p90: 42 },
    A_R: { p25: 21, p50: 27, p75: 35, p90: 45 },
  },
};

// Función para obtener el nivel de ansiedad
export function getSTAILevel(score: number, scale: 'A_E' | 'A_R'): { 
  level: string; 
  label: string; 
  color: string;
  description: string;
} {
  const cutoffs = STAI_CUTOFFS[scale];
  
  if (score <= cutoffs.low.max) {
    return { 
      level: 'low', 
      label: cutoffs.low.label, 
      color: cutoffs.low.color,
      description: 'Nivel bajo de ansiedad. No requiere intervención específica.'
    };
  }
  if (score <= cutoffs.normal.max) {
    return { 
      level: 'normal', 
      label: cutoffs.normal.label, 
      color: cutoffs.normal.color,
      description: 'Nivel normal de ansiedad. Dentro de rangos esperados.'
    };
  }
  if (score <= cutoffs.moderate.max) {
    return { 
      level: 'moderate', 
      label: cutoffs.moderate.label, 
      color: cutoffs.moderate.color,
      description: 'Nivel moderado de ansiedad. Se recomienda seguimiento.'
    };
  }
  return { 
    level: 'high', 
    label: cutoffs.high.label, 
    color: cutoffs.high.color,
    description: 'Nivel alto de ansiedad. Requiere intervención.'
  };
}

// Función para calcular percentil aproximado
export function getSTAIPercentile(
  score: number, 
  scale: 'A_E' | 'A_R', 
  gender: 'male' | 'female' = 'female'
): number {
  const norms = STAI_NORMS[gender][scale];
  
  if (score <= norms.p25) return Math.round((score / norms.p25) * 25);
  if (score <= norms.p50) return 25 + Math.round(((score - norms.p25) / (norms.p50 - norms.p25)) * 25);
  if (score <= norms.p75) return 50 + Math.round(((score - norms.p50) / (norms.p75 - norms.p50)) * 25);
  if (score <= norms.p90) return 75 + Math.round(((score - norms.p75) / (norms.p90 - norms.p75)) * 15);
  return Math.min(99, 90 + Math.round(((score - norms.p90) / (60 - norms.p90)) * 9));
}

// Función para calcular puntuación STAI considerando ítems invertidos
export function computeSTAIScore(
  answers: Record<string, number>,
  scale: 'A_E' | 'A_R'
): number {
  const startItem = scale === 'A_E' ? 1 : 21;
  const endItem = scale === 'A_E' ? 20 : 40;
  const reversedItems = STAI_REVERSED_ITEMS[scale];
  
  let sum = 0;
  for (let i = startItem; i <= endItem; i++) {
    const rawValue = answers[i.toString()] ?? answers[i];
    if (rawValue !== undefined) {
      const value = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10);
      // Invertir si es ítem invertido: 0,1,2,3 -> 3,2,1,0
      const finalValue = reversedItems.includes(i) ? (3 - value) : value;
      sum += finalValue;
    }
  }
  return sum;
}

// Datos de la plantilla para insertar en BD
export function getSTAITemplateData(): STAITemplateData {
  return {
    code: 'STAI',
    name: 'STAI - Cuestionario de Ansiedad Estado Rasgo',
    description: 'Evaluación diferenciada de la ansiedad como estado emocional transitorio (A/E) y como rasgo estable de personalidad (A/R). Desarrollado por Spielberger, Gorsuch y Lushene.',
    version: 1,
    response_min: 0,
    response_max: 3,
    flag_threshold: 31, // Aproximadamente percentil 75
    chart_full_mark: 60, // Máximo por escala (20 items x 3)
    min_label: 'Nada',
    max_label: 'Mucho',
    instructions: `Este cuestionario consta de dos partes:

**PARTE 1 - ANSIEDAD ESTADO (Ítems 1-20)**
A continuación encontrará unas frases que se utilizan corrientemente para describirse uno a sí mismo. Lea cada frase y señale la puntuación que indique mejor **cómo se siente Vd. AHORA MISMO, en este momento**.
- 0 = Nada
- 1 = Algo
- 2 = Bastante
- 3 = Mucho

**PARTE 2 - ANSIEDAD RASGO (Ítems 21-40)**
Lea cada frase y señale la puntuación que indique mejor **cómo se siente Vd. EN GENERAL, en la mayoría de las ocasiones**.
- 0 = Casi nunca
- 1 = A veces
- 2 = A menudo
- 3 = Casi siempre

No hay respuestas buenas ni malas. No emplee demasiado tiempo en cada frase y conteste señalando la respuesta que mejor describa su situación presente o habitual.`,
    items: [
      // PARTE 1: Ansiedad Estado (A/E) - Ítems 1-20
      // Items con formulación positiva (invertidos en scoring): 1, 2, 5, 8, 10, 11, 15, 16, 19, 20
      { index: 1, text: 'Me siento calmado', scale: 'A_E', reversed: true },
      { index: 2, text: 'Me siento seguro', scale: 'A_E', reversed: true },
      { index: 3, text: 'Estoy tenso', scale: 'A_E', reversed: false },
      { index: 4, text: 'Estoy contrariado', scale: 'A_E', reversed: false },
      { index: 5, text: 'Me siento cómodo (estoy a gusto)', scale: 'A_E', reversed: true },
      { index: 6, text: 'Me siento alterado', scale: 'A_E', reversed: false },
      { index: 7, text: 'Estoy preocupado ahora por posibles desgracias futuras', scale: 'A_E', reversed: false },
      { index: 8, text: 'Me siento descansado', scale: 'A_E', reversed: true },
      { index: 9, text: 'Me siento angustiado', scale: 'A_E', reversed: false },
      { index: 10, text: 'Me siento confortable', scale: 'A_E', reversed: true },
      { index: 11, text: 'Tengo confianza en mí mismo', scale: 'A_E', reversed: true },
      { index: 12, text: 'Me siento nervioso', scale: 'A_E', reversed: false },
      { index: 13, text: 'Estoy desasosegado', scale: 'A_E', reversed: false },
      { index: 14, text: 'Me siento muy "atado" (como oprimido)', scale: 'A_E', reversed: false },
      { index: 15, text: 'Estoy relajado', scale: 'A_E', reversed: true },
      { index: 16, text: 'Me siento satisfecho', scale: 'A_E', reversed: true },
      { index: 17, text: 'Estoy preocupado', scale: 'A_E', reversed: false },
      { index: 18, text: 'Me siento aturdido y sobreexcitado', scale: 'A_E', reversed: false },
      { index: 19, text: 'Me siento alegre', scale: 'A_E', reversed: true },
      { index: 20, text: 'En este momento me siento bien', scale: 'A_E', reversed: true },
      
      // PARTE 2: Ansiedad Rasgo (A/R) - Ítems 21-40
      // Items con formulación positiva (invertidos en scoring): 21, 26, 27, 30, 33, 36, 39
      { index: 21, text: 'Me siento bien', scale: 'A_R', reversed: true },
      { index: 22, text: 'Me canso rápidamente', scale: 'A_R', reversed: false },
      { index: 23, text: 'Siento ganas de llorar', scale: 'A_R', reversed: false },
      { index: 24, text: 'Me gustaría ser tan feliz como otros', scale: 'A_R', reversed: false },
      { index: 25, text: 'Pierdo oportunidades por no decidirme pronto', scale: 'A_R', reversed: false },
      { index: 26, text: 'Me siento descansado', scale: 'A_R', reversed: true },
      { index: 27, text: 'Soy una persona tranquila, serena y sosegada', scale: 'A_R', reversed: true },
      { index: 28, text: 'Veo que las dificultades se amontonan y no puedo con ellas', scale: 'A_R', reversed: false },
      { index: 29, text: 'Me preocupo demasiado por cosas sin importancia', scale: 'A_R', reversed: false },
      { index: 30, text: 'Soy feliz', scale: 'A_R', reversed: true },
      { index: 31, text: 'Suelo tomar las cosas demasiado seriamente', scale: 'A_R', reversed: false },
      { index: 32, text: 'Me falta confianza en mí mismo', scale: 'A_R', reversed: false },
      { index: 33, text: 'Me siento seguro', scale: 'A_R', reversed: true },
      { index: 34, text: 'No suelo afrontar las crisis o dificultades', scale: 'A_R', reversed: false },
      { index: 35, text: 'Me siento triste (melancólico)', scale: 'A_R', reversed: false },
      { index: 36, text: 'Estoy satisfecho', scale: 'A_R', reversed: true },
      { index: 37, text: 'Me rondan y molestan pensamientos sin importancia', scale: 'A_R', reversed: false },
      { index: 38, text: 'Me afectan tanto los desengaños, que no puedo olvidarlos', scale: 'A_R', reversed: false },
      { index: 39, text: 'Soy una persona estable', scale: 'A_R', reversed: true },
      { index: 40, text: 'Cuando pienso sobre asuntos y preocupaciones actuales, me pongo tenso y agitado', scale: 'A_R', reversed: false },
    ],
    scoring: {
      A_E: {
        items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        label: 'Ansiedad Estado',
        description: 'Estado emocional transitorio caracterizado por sentimientos subjetivos de tensión, aprensión y activación del sistema nervioso autónomo.',
        reversedItems: [1, 2, 5, 8, 10, 11, 15, 16, 19, 20],
      },
      A_R: {
        items: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
        label: 'Ansiedad Rasgo',
        description: 'Propensión ansiosa relativamente estable que caracteriza a los individuos en su tendencia a percibir situaciones como amenazadoras.',
        reversedItems: [21, 26, 27, 30, 33, 36, 39],
      },
    },
    interpretations: {
      'A_E_high_A_R_low': {
        interpretation: 'Ansiedad situacional: El paciente experimenta ansiedad elevada en este momento, pero no presenta una predisposición ansiosa estable. Esto sugiere que la ansiedad actual es reactiva a circunstancias específicas.',
        intervention: 'Identificar y trabajar los estresores actuales. Técnicas de relajación y manejo del estrés agudo. Seguimiento para verificar que la ansiedad remite cuando la situación mejora.',
      },
      'A_E_low_A_R_high': {
        interpretation: 'Predisposición ansiosa sin activación actual: El paciente tiene una tendencia general a la ansiedad, pero actualmente no está experimentando síntomas elevados. Puede indicar buena capacidad de afrontamiento actual o un momento de baja demanda.',
        intervention: 'Psicoeducación sobre la predisposición ansiosa. Entrenamiento en técnicas preventivas. Trabajo en reestructuración cognitiva de esquemas ansiosos.',
      },
      'A_E_high_A_R_high': {
        interpretation: 'Patrón ansioso persistente: El paciente presenta tanto una predisposición ansiosa estable como una activación actual elevada. Este perfil indica una mayor vulnerabilidad y posible cronificación.',
        intervention: 'Intervención multicomponente: relajación, reestructuración cognitiva, exposición gradual. Considerar valoración psiquiátrica. Trabajo a largo plazo sobre esquemas de vulnerabilidad.',
      },
      'A_E_low_A_R_low': {
        interpretation: 'Sin problemas de ansiedad significativos: El paciente no muestra ni predisposición ansiosa ni estado ansioso actual. Perfil dentro de la normalidad.',
        intervention: 'No requiere intervención específica para ansiedad. Si hay otras quejas, explorar otros dominios sintomáticos.',
      },
    },
  };
}

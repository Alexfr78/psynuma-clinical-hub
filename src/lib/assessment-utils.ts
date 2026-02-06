// Constantes configurables para umbrales de evaluación
export const THRESHOLD_HIGH = 4.00;
export const THRESHOLD_MODERATE = 3.00;

// ===== DCI SPECIFIC =====
export const DCI_CUTOFFS = {
  DET: 17.50, // Distanciamiento: suma >= 18 indica nivel clínico
  COM: 9.50,  // Compartimentación: suma >= 10 indica nivel clínico
};

export const DCI_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  DET: { label: 'Distanciamiento', description: 'Experiencias de distanciamiento del presente y de la realidad' },
  COM: { label: 'Compartimentación', description: 'División de partes del self o experiencias fragmentadas' },
  VAL: { label: 'Validez', description: 'Indicador de aquiescencia o respuesta aleatoria' },
};

export const DCI_FACTOR_ORDER = ['DET', 'COM'];

// ===== DES SPECIFIC =====
export const DES_CUTOFFS = {
  clinical: 30,  // Mean >= 30 indicates probable dissociative disorder
  elevated: 20,  // Mean >= 20 indicates elevated dissociative experiences
  taxon: 20,     // DES-T >= 20 indicates pathological dissociation (taxon)
};

export const DES_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  TOTAL: { label: 'Puntuación Total', description: 'Media de todas las experiencias disociativas' },
  DES_A: { label: 'Amnesia Disociativa', description: 'Experiencias de pérdida de memoria' },
  DES_D: { label: 'Despersonalización/Desrealización', description: 'Sensación de irrealidad' },
  DES_I: { label: 'Absorción/Imaginación', description: 'Absorción en experiencias internas' },
  DES_T: { label: 'Taxón Disociativo', description: 'Indicador de disociación patológica' },
};

export const DES_FACTOR_ORDER = ['TOTAL', 'DES_A', 'DES_D', 'DES_I', 'DES_T'];

// ===== BDI-II SPECIFIC =====
export const BDI2_CUTOFFS = [
  { min: 0, max: 13, level: 'minima', label: 'Depresión Mínima', color: 'green' },
  { min: 14, max: 19, level: 'leve', label: 'Depresión Leve', color: 'yellow' },
  { min: 20, max: 28, level: 'moderada', label: 'Depresión Moderada', color: 'orange' },
  { min: 29, max: 63, level: 'grave', label: 'Depresión Grave', color: 'red' },
];

export const BDI2_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  TOTAL: { label: 'Puntuación Total', description: 'Índice global de severidad depresiva (0-63)' },
  COG_AFECT: { label: 'Cognitivo-Afectivo', description: 'Síntomas cognitivos y afectivos (ítems 1-14)' },
  SOM_VEG: { label: 'Somático-Vegetativo', description: 'Síntomas somáticos y vegetativos (ítems 15-21)' },
};

export function getBDI2Level(totalScore: number): { level: string; label: string; color: string } {
  return BDI2_CUTOFFS.find(c => totalScore >= c.min && totalScore <= c.max) || BDI2_CUTOFFS[0];
}

// ===== STAI SPECIFIC =====
export const STAI_FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  A_E: { label: 'Ansiedad Estado', description: 'Estado emocional transitorio de tensión y activación (0-60)' },
  A_R: { label: 'Ansiedad Rasgo', description: 'Propensión ansiosa estable como característica de personalidad (0-60)' },
};

export const STAI_FACTOR_ORDER = ['A_E', 'A_R'];

// ===== EMO SPECIFIC =====
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
};

export const EMO_FACTOR_ORDER = [
  'hipoactivacion', 'hiperactivacion', 'disregulacion', 
  'autocritica', 'rumiacion', 'control'
];

// Mapeo de factores a labels completos - SELFCARE
export const FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  // SELFCARE factors
  AD: { 
    label: 'Conducta Autodestructiva', 
    description: 'Patrón de autocuidado invertido' 
  },
  TA: { 
    label: 'Falta de tolerancia al afecto positivo', 
    description: 'Dificultad para recibir elogios' 
  },
  PA: { 
    label: 'Problemas para dejarse ayudar', 
    description: 'Autosuficiencia defensiva' 
  },
  R: { 
    label: 'Resentimiento por no reciprocidad', 
    description: 'Sensación de injusticia' 
  },
  NP: { 
    label: 'No actividades positivas', 
    description: 'Dificultad para priorizar placer' 
  },
  NN: { 
    label: 'No atender las propias necesidades', 
    description: 'Prioriza necesidades ajenas' 
  },
  // SCL-90-R factors
  SOM: { 
    label: 'Somatización', 
    description: 'Síntomas somáticos y físicos' 
  },
  OBS: { 
    label: 'Obsesión-Compulsión', 
    description: 'Pensamientos y conductas obsesivas' 
  },
  SEN: { 
    label: 'Sensibilidad Interpersonal', 
    description: 'Sentimientos de inadecuación' 
  },
  DEP: { 
    label: 'Depresión', 
    description: 'Síntomas depresivos' 
  },
  ANS: { 
    label: 'Ansiedad', 
    description: 'Síntomas de ansiedad' 
  },
  HOS: { 
    label: 'Hostilidad', 
    description: 'Pensamientos y conductas hostiles' 
  },
  FOB: { 
    label: 'Ansiedad Fóbica', 
    description: 'Miedos fóbicos' 
  },
  PAR: { 
    label: 'Ideación Paranoide', 
    description: 'Suspicacia y desconfianza' 
  },
  PSI: { 
    label: 'Psicoticismo', 
    description: 'Síntomas psicóticos' 
  },
  // SCL-90-R Global indices
  GSI: { 
    label: 'Índice de Severidad Global', 
    description: 'Media de todos los ítems' 
  },
  PST: { 
    label: 'Total de Síntomas Positivos', 
    description: 'Número de síntomas presentes' 
  },
  PSDI: { 
    label: 'Índice de Malestar de Síntomas Positivos', 
    description: 'Intensidad promedio de síntomas presentes' 
  },
};

// Textos exactos de interpretación e intervención para cada factor
export const INTERPRETATION_TEXTS: Record<string, { interpretation: string; interventions: string[] }> = {
  // SELFCARE interpretations
  AD: {
    interpretation: 'Patrón de autocuidado invertido: cuando se encuentra peor, tiende a tratarse peor. Puede haber rabia dirigida hacia sí mismo y una voz crítica interiorizada.',
    interventions: [
      'Autocuidado cognitivo: entrenar un diálogo interno más compasivo ("¿qué necesitaría oír ahora?").',
      'Explorar origen y función de la voz crítica.',
      'Trabajo con partes/niño interior desde un enfoque seguro y compasivo.',
      'Plan de reducción de conductas de riesgo y aumento de conductas protectoras.',
    ],
  },
  TA: {
    interpretation: 'Dificultad para recibir elogios, reconocimiento o afecto positivo. Puede estar asociado a vergüenza o a experiencias tempranas de crítica/castigo al mostrarse.',
    interventions: [
      'Detectar y procesar bloqueos ante el elogio.',
      'Ejercicios graduados de aceptación del reconocimiento (exposición amable).',
      'Instalación de recursos de valía/aceptación.',
      'Trabajo con vergüenza asociada a ser visto positivamente.',
    ],
  },
  PA: {
    interpretation: 'Puede reflejar autosuficiencia defensiva y desconfianza básica. Pedir ayuda pudo vivirse como inútil o peligroso.',
    interventions: [
      'Reforzar seguridad y confianza en el vínculo terapéutico.',
      'Validar la necesidad legítima de apoyo.',
      'Reestructurar creencias tipo "pedir ayuda es debilidad".',
      'Ensayar peticiones pequeñas y concretas en contextos seguros.',
    ],
  },
  R: {
    interpretation: 'Sensación de injusticia y frustración porque los demás no responden como se espera. Puede haber expectativas elevadas derivadas de carencias previas.',
    interventions: [
      'Ajustar expectativas y diferenciar pasado vs presente.',
      'Clarificar necesidades actuales y formas realistas de pedirlas.',
      'Explorar límites y acuerdos en relaciones.',
      'Fomentar responsabilidad personal en autocuidado y petición de apoyo.',
    ],
  },
  NP: {
    interpretation: 'Dificultad para priorizar placer y actividades agradables. Puede estar sostenido por culpa, anhedonia o creencias de "no merezco disfrutar".',
    interventions: [
      'Programación gradual de actividades agradables (micro-pasos).',
      'Identificar culpa asociada al disfrute y trabajar permisos.',
      'Entrenar habilidades de disfrute/descanso consciente.',
      'Revisar barreras prácticas (tiempo, energía, hábitos).',
    ],
  },
  NN: {
    interpretation: 'Prioriza necesidades ajenas sobre las propias, con dificultad para poner límites. Puede estar relacionado con miedo a perder el vínculo o con rol de cuidador.',
    interventions: [
      'Entrenamiento en asertividad y límites.',
      'Legitimación de necesidades propias y autocuidado básico.',
      'Diferenciar "ser buena persona" de "dejarse invadir".',
      'Ensayar frases y conductas de protección del espacio personal.',
    ],
  },
  // SCL-90-R interpretations
  SOM: {
    interpretation: 'Elevado nivel de síntomas somáticos. Puede indicar somatización de la ansiedad o malestar emocional expresado a través del cuerpo.',
    interventions: [
      'Psicoeducación sobre la conexión mente-cuerpo.',
      'Técnicas de relajación y respiración.',
      'Explorar factores emocionales asociados a los síntomas.',
      'Valorar derivación médica si procede.',
    ],
  },
  OBS: {
    interpretation: 'Presencia significativa de pensamientos intrusivos, compulsiones o dificultad para soltar ideas. Puede afectar la funcionalidad diaria.',
    interventions: [
      'Técnicas de exposición con prevención de respuesta (si TOC).',
      'Reestructuración cognitiva de pensamientos obsesivos.',
      'Mindfulness para desapego de pensamientos.',
      'Valorar tratamiento farmacológico si severidad alta.',
    ],
  },
  SEN: {
    interpretation: 'Alta sensibilidad al rechazo y evaluación negativa de los demás. Sentimientos de inadecuación e inferioridad en contextos sociales.',
    interventions: [
      'Trabajo con autoestima y autoimagen.',
      'Exposición gradual a situaciones sociales temidas.',
      'Reestructuración de creencias sobre evaluación social.',
      'Entrenamiento en habilidades sociales.',
    ],
  },
  DEP: {
    interpretation: 'Síntomas depresivos significativos: bajo estado de ánimo, pérdida de interés, fatiga, pensamientos negativos sobre sí mismo y el futuro.',
    interventions: [
      'Activación conductual gradual.',
      'Reestructuración de pensamientos negativos automáticos.',
      'Evaluar ideación autolítica y establecer plan de seguridad si precisa.',
      'Valorar tratamiento farmacológico.',
    ],
  },
  ANS: {
    interpretation: 'Elevados niveles de ansiedad: nerviosismo, tensión, síntomas de pánico. Puede estar afectando la funcionalidad.',
    interventions: [
      'Psicoeducación sobre la respuesta de ansiedad.',
      'Técnicas de relajación y respiración diafragmática.',
      'Exposición gradual a situaciones evitadas.',
      'Reestructuración de pensamientos catastróficos.',
    ],
  },
  HOS: {
    interpretation: 'Presencia de hostilidad, irritabilidad e ira. Puede manifestarse en pensamientos agresivos o dificultad para controlar impulsos.',
    interventions: [
      'Técnicas de control de la ira.',
      'Identificar desencadenantes y señales de alerta.',
      'Entrenamiento en comunicación asertiva.',
      'Explorar fuentes subyacentes de frustración.',
    ],
  },
  FOB: {
    interpretation: 'Miedos fóbicos significativos: agorafobia, fobias sociales o específicas que limitan el funcionamiento.',
    interventions: [
      'Jerarquía de exposición gradual.',
      'Técnicas de afrontamiento en situaciones temidas.',
      'Reestructuración de creencias sobre el peligro.',
      'Considerar EMDR si hay trauma asociado.',
    ],
  },
  PAR: {
    interpretation: 'Tendencia a la suspicacia, desconfianza hacia los demás, sensación de que otros hablan mal o tienen intenciones hostiles.',
    interventions: [
      'Explorar experiencias pasadas de traición o daño.',
      'Trabajo con distorsiones cognitivas (lectura de mente, personalización).',
      'Construir experiencias relacionales seguras.',
      'Evaluar contexto actual de relaciones.',
    ],
  },
  PSI: {
    interpretation: 'Presencia de síntomas del espectro psicótico: experiencias inusuales, pensamiento mágico, aislamiento, despersonalización.',
    interventions: [
      'Evaluación exhaustiva de síntomas psicóticos.',
      'Valorar derivación a psiquiatría.',
      'Trabajo con síntomas disociativos si presentes.',
      'Intervención temprana si síndrome prodrómico.',
    ],
  },
  GSI: {
    interpretation: 'El Índice de Severidad Global indica el nivel medio de malestar. Valores elevados sugieren alta sintomatología general.',
    interventions: [
      'Priorizar áreas de mayor malestar.',
      'Establecer plan terapéutico integral.',
      'Considerar apoyo farmacológico si severidad alta.',
      'Seguimiento frecuente de evolución.',
    ],
  },
};

// Orden canónico de factores para visualización consistente - SELFCARE
export const FACTOR_ORDER = ['AD', 'TA', 'PA', 'R', 'NP', 'NN'];

// Orden canónico de factores para SCL-90-R
export const SCL90_FACTOR_ORDER = ['SOM', 'OBS', 'SEN', 'DEP', 'ANS', 'HOS', 'FOB', 'PAR', 'PSI'];
export const SCL90_GLOBAL_ORDER = ['GSI', 'PST', 'PSDI'];

// Función para obtener el orden correcto según el código de plantilla
export function getFactorOrder(templateCode: string): string[] {
  if (templateCode === 'SCL90_V1') {
    return SCL90_FACTOR_ORDER;
  }
  if (templateCode === 'DCI') {
    return DCI_FACTOR_ORDER;
  }
  if (templateCode === 'DES') {
    return DES_FACTOR_ORDER;
  }
  if (templateCode === 'STAI') {
    return STAI_FACTOR_ORDER;
  }
  return FACTOR_ORDER;
}

// Función para calcular nivel según puntuación
export function computeLevel(score: number, threshold?: number): 'bajo' | 'moderado' | 'alto' {
  const high = threshold ?? THRESHOLD_HIGH;
  const moderate = threshold ? threshold * 0.75 : THRESHOLD_MODERATE;
  if (score > high) return 'alto';
  if (score > moderate) return 'moderado';
  return 'bajo';
}

// Función para determinar si un factor está en alerta
export function isAlert(score: number, threshold?: number): boolean {
  return score > (threshold ?? THRESHOLD_HIGH);
}

// Función para obtener factores en alerta ordenados
export function getHighFactors(
  factorScores: Record<string, number>, 
  templateCode?: string,
  threshold?: number
): { code: string; score: number }[] {
  const order = templateCode ? getFactorOrder(templateCode) : FACTOR_ORDER;
  const alertThreshold = threshold ?? THRESHOLD_HIGH;
  
  return order
    .filter(code => factorScores[code] !== undefined && isAlert(factorScores[code], alertThreshold))
    .map(code => ({ code, score: factorScores[code] }))
    .sort((a, b) => b.score - a.score);
}

// Función para formatear datos para el gráfico
export function formatChartData(factorScores: Record<string, number>, templateCode?: string, fullMark?: number) {
  const order = templateCode ? getFactorOrder(templateCode) : FACTOR_ORDER;
  const maxValue = fullMark ?? 7;
  
  return order
    .filter(code => factorScores[code] !== undefined)
    .map(code => ({
      factor: code,
      label: FACTOR_LABELS[code]?.label || code,
      score: factorScores[code],
      fullMark: maxValue,
    }));
}
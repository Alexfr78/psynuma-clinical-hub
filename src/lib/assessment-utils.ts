// Constantes configurables para umbrales de evaluación
export const THRESHOLD_HIGH = 4.00;
export const THRESHOLD_MODERATE = 3.00;

// Mapeo de factores a labels completos
export const FACTOR_LABELS: Record<string, { label: string; description: string }> = {
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
};

// Textos exactos de interpretación e intervención para cada factor
export const INTERPRETATION_TEXTS: Record<string, { interpretation: string; interventions: string[] }> = {
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
};

// Orden canónico de factores para visualización consistente
export const FACTOR_ORDER = ['AD', 'TA', 'PA', 'R', 'NP', 'NN'];

// Función para calcular nivel según puntuación
export function computeLevel(score: number): 'bajo' | 'moderado' | 'alto' {
  if (score > THRESHOLD_HIGH) return 'alto';
  if (score > THRESHOLD_MODERATE) return 'moderado';
  return 'bajo';
}

// Función para determinar si un factor está en alerta
export function isAlert(score: number): boolean {
  return score > THRESHOLD_HIGH;
}

// Función para obtener factores en alerta ordenados
export function getHighFactors(factorScores: Record<string, number>): { code: string; score: number }[] {
  return FACTOR_ORDER
    .filter(code => factorScores[code] !== undefined && isAlert(factorScores[code]))
    .map(code => ({ code, score: factorScores[code] }))
    .sort((a, b) => b.score - a.score);
}

// Función para formatear datos para el gráfico
export function formatChartData(factorScores: Record<string, number>) {
  return FACTOR_ORDER
    .filter(code => factorScores[code] !== undefined)
    .map(code => ({
      factor: code,
      label: FACTOR_LABELS[code]?.label || code,
      score: factorScores[code],
      fullMark: 7,
    }));
}

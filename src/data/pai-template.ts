// PAI - Inventario de Evaluación de la Personalidad (Personality Assessment Inventory)
// Adaptación española de TEA Ediciones basada en el manual de Morey

export interface PAIItem {
  index: number;
  text: string;
  reversed?: boolean; // Items que se puntúan de forma inversa
}

export interface PAIScale {
  code: string;
  label: string;
  description: string;
  items: number[];
  subscales?: Record<string, { label: string; items: number[] }>;
}

export interface PAITemplate {
  code: string;
  name: string;
  description: string;
  instructions: string;
  response_min: number;
  response_max: number;
  min_label: string;
  max_label: string;
  labels: string[];
  items: PAIItem[];
  validityScales: PAIScale[];
  clinicalScales: PAIScale[];
  treatmentScales: PAIScale[];
  interpersonalScales: PAIScale[];
  flag_threshold: number;
  chart_full_mark: number;
}

// Escalas de validez del PAI
const VALIDITY_SCALES: PAIScale[] = [
  {
    code: 'INC',
    label: 'Inconsistencia',
    description: 'Detecta respuestas aleatorias o inconsistentes',
    items: [], // Se calcula comparando pares de ítems similares
  },
  {
    code: 'INF',
    label: 'Infrecuencia',
    description: 'Detecta respuestas atípicas o exageradas',
    items: [16, 55, 89, 120, 152, 186, 218, 251],
  },
  {
    code: 'IMN',
    label: 'Impresión Negativa',
    description: 'Tendencia a exagerar síntomas o problemas',
    items: [23, 56, 90, 121, 153, 187, 219, 252, 282],
  },
  {
    code: 'IMP',
    label: 'Impresión Positiva',
    description: 'Tendencia a dar una imagen favorable',
    items: [10, 44, 78, 112, 145, 179, 211, 244, 277],
  },
];

// Escalas clínicas del PAI
const CLINICAL_SCALES: PAIScale[] = [
  {
    code: 'SOM',
    label: 'Quejas Somáticas',
    description: 'Preocupación por síntomas físicos y salud',
    items: [1, 35, 69, 103, 136, 170, 202, 235, 268, 299, 323, 2, 36, 70, 104, 137, 171, 203, 236, 269, 300, 324, 3, 37],
    subscales: {
      'SOM-C': { label: 'Conversión', items: [1, 35, 69, 103, 136, 170, 202, 235] },
      'SOM-S': { label: 'Somatización', items: [268, 299, 323, 2, 36, 70, 104, 137] },
      'SOM-H': { label: 'Hipocondría', items: [171, 203, 236, 269, 300, 324, 3, 37] },
    },
  },
  {
    code: 'ANX',
    label: 'Ansiedad',
    description: 'Síntomas de ansiedad y tensión',
    items: [4, 38, 72, 106, 139, 173, 205, 238, 271, 301, 325, 5, 39, 73, 107, 140, 174, 206, 239, 272, 302, 326, 6, 40],
    subscales: {
      'ANX-C': { label: 'Cognitiva', items: [4, 38, 72, 106, 139, 173, 205, 238] },
      'ANX-A': { label: 'Afectiva', items: [271, 301, 325, 5, 39, 73, 107, 140] },
      'ANX-P': { label: 'Fisiológica', items: [174, 206, 239, 272, 302, 326, 6, 40] },
    },
  },
  {
    code: 'ARD',
    label: 'Trastornos Relacionados con la Ansiedad',
    description: 'Fobias, trauma y obsesiones',
    items: [7, 41, 75, 109, 142, 176, 208, 241, 274, 303, 327, 8, 42, 76, 110, 143, 177, 209, 242, 275, 304, 328, 9, 43],
    subscales: {
      'ARD-O': { label: 'Obsesivo-Compulsivo', items: [7, 41, 75, 109, 142, 176, 208, 241] },
      'ARD-P': { label: 'Fobias', items: [274, 303, 327, 8, 42, 76, 110, 143] },
      'ARD-T': { label: 'Estrés Traumático', items: [177, 209, 242, 275, 304, 328, 9, 43] },
    },
  },
  {
    code: 'DEP',
    label: 'Depresión',
    description: 'Síntomas depresivos',
    items: [11, 45, 79, 113, 146, 180, 212, 245, 278, 305, 329, 12, 46, 80, 114, 147, 181, 213, 246, 279, 306, 330, 13, 47],
    subscales: {
      'DEP-C': { label: 'Cognitiva', items: [11, 45, 79, 113, 146, 180, 212, 245] },
      'DEP-A': { label: 'Afectiva', items: [278, 305, 329, 12, 46, 80, 114, 147] },
      'DEP-P': { label: 'Fisiológica', items: [181, 213, 246, 279, 306, 330, 13, 47] },
    },
  },
  {
    code: 'MAN',
    label: 'Manía',
    description: 'Síntomas maníacos e hipomaníacos',
    items: [14, 48, 82, 116, 149, 183, 215, 248, 280, 307, 331, 15, 49, 83, 117, 150, 184, 216, 249, 281, 308, 332, 17, 51],
    subscales: {
      'MAN-A': { label: 'Nivel de Actividad', items: [14, 48, 82, 116, 149, 183, 215, 248] },
      'MAN-G': { label: 'Grandiosidad', items: [280, 307, 331, 15, 49, 83, 117, 150] },
      'MAN-I': { label: 'Irritabilidad', items: [184, 216, 249, 281, 308, 332, 17, 51] },
    },
  },
  {
    code: 'PAR',
    label: 'Paranoia',
    description: 'Suspicacia y desconfianza',
    items: [18, 52, 86, 118, 151, 185, 217, 250, 283, 309, 333, 19, 53, 87, 119, 154, 188, 220, 253, 284, 310, 334, 20, 54],
    subscales: {
      'PAR-H': { label: 'Hipervigilancia', items: [18, 52, 86, 118, 151, 185, 217, 250] },
      'PAR-P': { label: 'Persecución', items: [283, 309, 333, 19, 53, 87, 119, 154] },
      'PAR-R': { label: 'Resentimiento', items: [188, 220, 253, 284, 310, 334, 20, 54] },
    },
  },
  {
    code: 'SCZ',
    label: 'Esquizofrenia',
    description: 'Síntomas del espectro psicótico',
    items: [21, 57, 91, 122, 155, 189, 221, 254, 285, 311, 335, 22, 58, 92, 123, 156, 190, 222, 255, 286, 312, 336, 24, 59],
    subscales: {
      'SCZ-P': { label: 'Experiencias Psicóticas', items: [21, 57, 91, 122, 155, 189, 221, 254] },
      'SCZ-S': { label: 'Aislamiento Social', items: [285, 311, 335, 22, 58, 92, 123, 156] },
      'SCZ-T': { label: 'Trastorno del Pensamiento', items: [190, 222, 255, 286, 312, 336, 24, 59] },
    },
  },
  {
    code: 'BOR',
    label: 'Rasgos Límite',
    description: 'Características del trastorno límite',
    items: [25, 60, 93, 124, 157, 191, 223, 256, 287, 313, 337, 26, 61, 94, 125, 158, 192, 224, 257, 288, 314, 338, 27, 62],
    subscales: {
      'BOR-A': { label: 'Inestabilidad Afectiva', items: [25, 60, 93, 124, 157, 191, 223, 256] },
      'BOR-I': { label: 'Problemas de Identidad', items: [287, 313, 337, 26, 61, 94, 125, 158] },
      'BOR-N': { label: 'Relaciones Negativas', items: [192, 224, 257, 288, 314, 338, 27, 62] },
      'BOR-S': { label: 'Autolesiones', items: [95, 126, 159, 193, 225, 258, 289, 315] },
    },
  },
  {
    code: 'ANT',
    label: 'Rasgos Antisociales',
    description: 'Conducta antisocial y psicopática',
    items: [28, 63, 96, 127, 160, 194, 226, 259, 290, 316, 339, 29, 64, 97, 128, 161, 195, 227, 260, 291, 317, 340, 30, 65],
    subscales: {
      'ANT-A': { label: 'Conductas Antisociales', items: [28, 63, 96, 127, 160, 194, 226, 259] },
      'ANT-E': { label: 'Egocentrismo', items: [290, 316, 339, 29, 64, 97, 128, 161] },
      'ANT-S': { label: 'Búsqueda de Sensaciones', items: [195, 227, 260, 291, 317, 340, 30, 65] },
    },
  },
  {
    code: 'ALC',
    label: 'Problemas con el Alcohol',
    description: 'Consumo problemático de alcohol',
    items: [31, 66, 98, 129, 162, 196, 228, 261, 292, 318, 341, 32, 67],
  },
  {
    code: 'DRG',
    label: 'Problemas con las Drogas',
    description: 'Consumo problemático de drogas',
    items: [33, 68, 99, 130, 163, 197, 229, 262, 293, 319, 342, 34, 71],
  },
];

// Escalas de tratamiento del PAI
const TREATMENT_SCALES: PAIScale[] = [
  {
    code: 'AGG',
    label: 'Agresión',
    description: 'Actitudes y conductas agresivas',
    items: [74, 108, 141, 175, 207, 240, 273, 298, 322, 77, 111, 144, 178, 210, 243, 276, 297, 321, 81, 115],
    subscales: {
      'AGG-A': { label: 'Actitud Agresiva', items: [74, 108, 141, 175, 207, 240, 273] },
      'AGG-V': { label: 'Agresión Verbal', items: [298, 322, 77, 111, 144, 178, 210] },
      'AGG-P': { label: 'Agresión Física', items: [243, 276, 297, 321, 81, 115] },
    },
  },
  {
    code: 'SUI',
    label: 'Ideación Suicida',
    description: 'Pensamientos y planes suicidas',
    items: [84, 85, 132, 133, 164, 165, 198, 199, 230, 231, 263, 264],
  },
  {
    code: 'STR',
    label: 'Estrés',
    description: 'Nivel de estrés percibido',
    items: [100, 101, 134, 135, 166, 167, 200, 201, 232, 233, 265, 266],
  },
  {
    code: 'NON',
    label: 'Falta de Apoyo Social',
    description: 'Percepción de apoyo social inadecuado',
    items: [102, 138, 168, 169, 234, 267, 294, 295, 296, 320, 343, 344],
  },
  {
    code: 'RXR',
    label: 'Rechazo al Tratamiento',
    description: 'Resistencia a la intervención terapéutica',
    items: [50, 88, 131, 148, 182, 214, 247, 270],
  },
];

// Escalas interpersonales del PAI
const INTERPERSONAL_SCALES: PAIScale[] = [
  {
    code: 'DOM',
    label: 'Dominancia',
    description: 'Estilo interpersonal dominante vs. sumiso',
    items: [105, 172, 204, 237, 269, 300, 324, 339, 340, 341, 342, 343],
  },
  {
    code: 'WRM',
    label: 'Afabilidad',
    description: 'Estilo interpersonal cálido vs. frío',
    items: [106, 173, 205, 238, 271, 301, 325, 326, 327, 328, 329, 330],
  },
];

// Generar 344 ítems placeholder (a reemplazar con ítems reales del PAI)
function generatePlaceholderItems(): PAIItem[] {
  const items: PAIItem[] = [];
  
  // Ejemplos de ítems representativos por escala (traducidos/adaptados para desarrollo)
  const sampleItems: Record<number, string> = {
    // Validez - Infrecuencia (INF)
    16: 'A veces me siento nervioso/a.',
    55: 'Ocasionalmente tengo pensamientos que preferiría no tener.',
    89: 'De vez en cuando me siento triste sin motivo aparente.',
    
    // Validez - Impresión Negativa (IMN)
    23: 'Todo en mi vida es un desastre absoluto.',
    56: 'No puedo hacer nada bien, todo me sale mal.',
    
    // Validez - Impresión Positiva (IMP)
    10: 'Nunca he tenido un mal pensamiento sobre nadie.',
    44: 'Siempre digo la verdad, sin excepción.',
    
    // Quejas Somáticas (SOM)
    1: 'A menudo tengo dolores de cabeza.',
    35: 'Frecuentemente me siento fatigado/a sin razón.',
    69: 'Tengo problemas de estómago con frecuencia.',
    
    // Ansiedad (ANX)
    4: 'Me preocupo demasiado por cosas pequeñas.',
    38: 'A menudo me siento tenso/a o nervioso/a.',
    72: 'Tengo dificultad para relajarme.',
    
    // Depresión (DEP)
    11: 'Me siento triste la mayor parte del tiempo.',
    45: 'He perdido interés en las cosas que antes disfrutaba.',
    79: 'A veces siento que la vida no vale la pena.',
    
    // Paranoia (PAR)
    18: 'Siento que la gente me vigila.',
    52: 'Desconfío de las intenciones de los demás.',
    86: 'Creo que algunos intentan hacerme daño.',
    
    // Esquizofrenia (SCZ)
    21: 'A veces escucho cosas que otros no escuchan.',
    57: 'Mis pensamientos a veces se sienten ajenos a mí.',
    
    // Rasgos Límite (BOR)
    25: 'Mis emociones cambian rápidamente sin razón.',
    60: 'A menudo me siento vacío/a por dentro.',
    93: 'Mis relaciones suelen ser intensas pero inestables.',
    
    // Rasgos Antisociales (ANT)
    28: 'Las reglas están hechas para romperse.',
    63: 'A veces hago cosas impulsivas que luego lamento.',
    
    // Agresión (AGG)
    74: 'Me enfado fácilmente con los demás.',
    108: 'A veces me cuesta controlar mi temperamento.',
    
    // Ideación Suicida (SUI)
    84: 'He pensado en hacerme daño.',
    85: 'A veces desearía no existir.',
    132: 'He considerado formas de acabar con mi vida.',
    
    // Estrés (STR)
    100: 'Últimamente he tenido muchos problemas.',
    101: 'Me siento abrumado/a por las presiones de la vida.',
    
    // Dominancia (DOM)
    105: 'Me gusta tomar el control en las situaciones sociales.',
    
    // Afabilidad (WRM)
    106: 'Disfruto estando cerca de otras personas.',
  };
  
  for (let i = 1; i <= 344; i++) {
    items.push({
      index: i,
      text: sampleItems[i] || `Ítem PAI ${i} - [Texto del ítem a completar con contenido oficial]`,
    });
  }
  
  return items;
}

// Plantilla PAI completa
export const PAI_TEMPLATE: PAITemplate = {
  code: 'PAI_V1',
  name: 'Inventario de Evaluación de la Personalidad (PAI)',
  description: 'Evaluación multidimensional de la personalidad y psicopatología en adultos. Basado en el manual de Morey y la adaptación española de TEA Ediciones.',
  instructions: `Por favor, lea cada afirmación y decida hasta qué punto le describe o se aplica a usted.

Responda según cómo se ha sentido o comportado DURANTE LAS ÚLTIMAS SEMANAS.

Hay cuatro opciones de respuesta:
- Falso, nada cierto (1)
- Ligeramente cierto (2)
- Bastante cierto (3)
- Muy cierto (4)

No hay respuestas correctas o incorrectas. Responda de forma sincera y espontánea.
No dedique demasiado tiempo a cada pregunta; la primera impresión suele ser la más acertada.

Este cuestionario tardará aproximadamente 45-60 minutos en completarse.`,
  response_min: 1,
  response_max: 4,
  min_label: 'Falso, nada cierto',
  max_label: 'Muy cierto',
  labels: ['Falso, nada cierto', 'Ligeramente cierto', 'Bastante cierto', 'Muy cierto'],
  items: generatePlaceholderItems(),
  validityScales: VALIDITY_SCALES,
  clinicalScales: CLINICAL_SCALES,
  treatmentScales: TREATMENT_SCALES,
  interpersonalScales: INTERPERSONAL_SCALES,
  flag_threshold: 65, // Puntuación T para considerar elevación clínica
  chart_full_mark: 100, // Máximo para gráficos (puntuaciones T)
};

// Función para obtener todas las escalas como objeto scoring
export function getPAIScoring(): Record<string, { items: number[]; label: string }> {
  const scoring: Record<string, { items: number[]; label: string }> = {};
  
  // Escalas de validez
  for (const scale of PAI_TEMPLATE.validityScales) {
    if (scale.items.length > 0) {
      scoring[scale.code] = { items: scale.items, label: scale.label };
    }
  }
  
  // Escalas clínicas y subescalas
  for (const scale of PAI_TEMPLATE.clinicalScales) {
    scoring[scale.code] = { items: scale.items, label: scale.label };
    if (scale.subscales) {
      for (const [subCode, sub] of Object.entries(scale.subscales)) {
        scoring[subCode] = { items: sub.items, label: sub.label };
      }
    }
  }
  
  // Escalas de tratamiento y subescalas
  for (const scale of PAI_TEMPLATE.treatmentScales) {
    scoring[scale.code] = { items: scale.items, label: scale.label };
    if (scale.subscales) {
      for (const [subCode, sub] of Object.entries(scale.subscales)) {
        scoring[subCode] = { items: sub.items, label: sub.label };
      }
    }
  }
  
  // Escalas interpersonales
  for (const scale of PAI_TEMPLATE.interpersonalScales) {
    scoring[scale.code] = { items: scale.items, label: scale.label };
  }
  
  return scoring;
}

// Orden de escalas principales para visualización
export const PAI_SCALE_ORDER = {
  validity: ['INC', 'INF', 'IMN', 'IMP'],
  clinical: ['SOM', 'ANX', 'ARD', 'DEP', 'MAN', 'PAR', 'SCZ', 'BOR', 'ANT', 'ALC', 'DRG'],
  treatment: ['AGG', 'SUI', 'STR', 'NON', 'RXR'],
  interpersonal: ['DOM', 'WRM'],
};

// Umbrales de interpretación (puntuaciones T)
export const PAI_THRESHOLDS = {
  normal: { min: 0, max: 59, label: 'Normal', color: 'green' },
  moderate: { min: 60, max: 69, label: 'Moderado', color: 'yellow' },
  elevated: { min: 70, max: 79, label: 'Elevado', color: 'orange' },
  marked: { min: 80, max: 100, label: 'Muy elevado', color: 'red' },
};

// Baremos simplificados para conversión a T (valores aproximados)
// En producción, usar tablas completas del manual
export const PAI_T_CONVERSION = {
  // Media = 50, DE = 10 para población general
  mean: 50,
  sd: 10,
};

// Labels en español para todas las escalas
export const PAI_SCALE_LABELS: Record<string, { label: string; description: string }> = {
  // Validez
  INC: { label: 'Inconsistencia', description: 'Detecta respuestas aleatorias o inconsistentes' },
  INF: { label: 'Infrecuencia', description: 'Detecta respuestas atípicas o exageradas' },
  IMN: { label: 'Impresión Negativa', description: 'Tendencia a exagerar síntomas' },
  IMP: { label: 'Impresión Positiva', description: 'Tendencia a dar imagen favorable' },
  
  // Clínicas
  SOM: { label: 'Quejas Somáticas', description: 'Preocupación por síntomas físicos' },
  'SOM-C': { label: 'Conversión', description: 'Síntomas de conversión' },
  'SOM-S': { label: 'Somatización', description: 'Quejas somáticas diversas' },
  'SOM-H': { label: 'Hipocondría', description: 'Preocupación por la salud' },
  
  ANX: { label: 'Ansiedad', description: 'Síntomas de ansiedad' },
  'ANX-C': { label: 'Ansiedad Cognitiva', description: 'Preocupación y rumiación' },
  'ANX-A': { label: 'Ansiedad Afectiva', description: 'Tensión y nerviosismo' },
  'ANX-P': { label: 'Ansiedad Fisiológica', description: 'Síntomas físicos de ansiedad' },
  
  ARD: { label: 'Trastornos Relacionados con Ansiedad', description: 'Fobias, trauma, obsesiones' },
  'ARD-O': { label: 'Obsesivo-Compulsivo', description: 'Pensamientos y conductas obsesivas' },
  'ARD-P': { label: 'Fobias', description: 'Miedos irracionales' },
  'ARD-T': { label: 'Estrés Traumático', description: 'Síntomas postraumáticos' },
  
  DEP: { label: 'Depresión', description: 'Síntomas depresivos' },
  'DEP-C': { label: 'Depresión Cognitiva', description: 'Pensamientos negativos' },
  'DEP-A': { label: 'Depresión Afectiva', description: 'Tristeza y anhedonia' },
  'DEP-P': { label: 'Depresión Fisiológica', description: 'Síntomas somáticos de depresión' },
  
  MAN: { label: 'Manía', description: 'Síntomas maníacos' },
  'MAN-A': { label: 'Nivel de Actividad', description: 'Hiperactividad y energía' },
  'MAN-G': { label: 'Grandiosidad', description: 'Autoestima inflada' },
  'MAN-I': { label: 'Irritabilidad', description: 'Irritabilidad y hostilidad' },
  
  PAR: { label: 'Paranoia', description: 'Suspicacia y desconfianza' },
  'PAR-H': { label: 'Hipervigilancia', description: 'Estado de alerta constante' },
  'PAR-P': { label: 'Persecución', description: 'Ideas de persecución' },
  'PAR-R': { label: 'Resentimiento', description: 'Rencor y hostilidad' },
  
  SCZ: { label: 'Esquizofrenia', description: 'Síntomas del espectro psicótico' },
  'SCZ-P': { label: 'Experiencias Psicóticas', description: 'Alucinaciones y delirios' },
  'SCZ-S': { label: 'Aislamiento Social', description: 'Retraimiento social' },
  'SCZ-T': { label: 'Trastorno del Pensamiento', description: 'Pensamiento desorganizado' },
  
  BOR: { label: 'Rasgos Límite', description: 'Características del trastorno límite' },
  'BOR-A': { label: 'Inestabilidad Afectiva', description: 'Cambios emocionales bruscos' },
  'BOR-I': { label: 'Problemas de Identidad', description: 'Incertidumbre sobre uno mismo' },
  'BOR-N': { label: 'Relaciones Negativas', description: 'Relaciones conflictivas' },
  'BOR-S': { label: 'Autolesiones', description: 'Conductas autolesivas' },
  
  ANT: { label: 'Rasgos Antisociales', description: 'Conducta antisocial' },
  'ANT-A': { label: 'Conductas Antisociales', description: 'Historial de conductas antisociales' },
  'ANT-E': { label: 'Egocentrismo', description: 'Falta de empatía' },
  'ANT-S': { label: 'Búsqueda de Sensaciones', description: 'Necesidad de estimulación' },
  
  ALC: { label: 'Problemas con el Alcohol', description: 'Uso problemático de alcohol' },
  DRG: { label: 'Problemas con las Drogas', description: 'Uso problemático de drogas' },
  
  // Tratamiento
  AGG: { label: 'Agresión', description: 'Actitudes y conductas agresivas' },
  'AGG-A': { label: 'Actitud Agresiva', description: 'Actitudes hostiles' },
  'AGG-V': { label: 'Agresión Verbal', description: 'Expresión verbal de agresión' },
  'AGG-P': { label: 'Agresión Física', description: 'Conductas físicamente agresivas' },
  
  SUI: { label: 'Ideación Suicida', description: 'Pensamientos suicidas' },
  STR: { label: 'Estrés', description: 'Nivel de estrés percibido' },
  NON: { label: 'Falta de Apoyo Social', description: 'Apoyo social insuficiente' },
  RXR: { label: 'Rechazo al Tratamiento', description: 'Resistencia a la terapia' },
  
  // Interpersonales
  DOM: { label: 'Dominancia', description: 'Estilo dominante vs. sumiso' },
  WRM: { label: 'Afabilidad', description: 'Estilo cálido vs. frío' },
};

// Escalas críticas para alertas
export const PAI_CRITICAL_SCALES = ['SUI', 'AGG-P', 'SCZ-P', 'BOR-S'];

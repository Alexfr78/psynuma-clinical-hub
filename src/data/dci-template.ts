// Inventario de Distanciamiento y Compartimentación (DCI)
// Adaptación española: Perona-Garcerán et al. (2021)
// Original: Butler et al. (2019)

export interface DCITemplateData {
  code: string;
  name: string;
  description: string;
  version: number;
  response_min: number;
  response_max: number;
  min_label: string;
  max_label: string;
  items: { index: number; text: string }[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  instructions: string;
  flag_threshold: number;
  chart_full_mark: number;
}

// Puntos de corte clínicos del DCI
export const DCI_CUTOFFS = {
  DET: 17.50, // Distanciamiento: suma >= 18 indica nivel clínico
  COM: 9.50,  // Compartimentación: suma >= 10 indica nivel clínico
};

// Items del DCI (22 items totales)
// Escala Distanciamiento (DET): 1, 2, 3, 4, 7, 11, 12, 18, 19, 22
// Escala Compartimentación (COM): 5, 6, 9, 10, 13, 14, 16, 17, 20, 21
// Escala Validez (VAL): 8, 15

const DCI_ITEMS = [
  { index: 1, text: "Cuando estoy escuchando hablar a alguien, de repente me doy cuenta de que no oigo todo o parte de lo que dice." },
  { index: 2, text: "Lo que veo me parece plano o sin vida, como si estuviera mirando una foto." },
  { index: 3, text: "Me concentro en algo que tengo en la cabeza y más o menos pierdo el hilo de lo que está pasando a mi alrededor." },
  { index: 4, text: "Me siento como si estuviera mirando una situación desde el punto de vista de un observador o espectador." },
  { index: 5, text: "Me siento dividido, como si tuviera varias partes o fuerzas con sentimientos, ideas, recuerdos y comportamientos que no considero propios." },
  { index: 6, text: "Me siento como si algo o alguien me hubiera poseído." },
  { index: 7, text: "A veces entro en un estado similar al trance en el que soy apenas consciente, o no soy consciente, de lo que pasa a mi alrededor." },
  { index: 8, text: "Cruzo la calle por donde no hay paso de peatones o con el semáforo en rojo." },
  { index: 9, text: "Siento emociones intensas que no parecen pertenecerme." },
  { index: 10, text: "No siento todas las partes del cuerpo y no hay ningún motivo médico o físico." },
  { index: 11, text: "Me siento desvinculado de recuerdos de cosas que me han pasado, como si no tuvieran nada que ver conmigo." },
  { index: 12, text: "Mi mente se queda en blanco o vacía por completo." },
  { index: 13, text: "La gente me dice que mi comportamiento cambia drásticamente o que parezco una persona diferente." },
  { index: 14, text: "Me encuentro en un sitio y no tengo ni idea de cómo he llegado ni por qué estoy allí." },
  { index: 15, text: "Digo pequeñas mentiras para evitar que la gente se decepcione o se enfade conmigo." },
  { index: 16, text: "A veces me siento desconectado del cuerpo, que no parece mío." },
  { index: 17, text: "Parece que algo dentro de mí me obliga a hacer cosas que no quiero hacer." },
  { index: 18, text: "Me siento mecánico, como un robot o como si no fuera humano." },
  { index: 19, text: "Miro el reloj y me doy cuenta de que ha pasado el tiempo y no recuerdo qué ha sucedido." },
  { index: 20, text: "Siento que no controlo lo que hace mi cuerpo, como si hubiera algo o alguien dentro de mí dirigiendo mis acciones." },
  { index: 21, text: "Voy cambiando entre unos sentimientos que parecen pertenecerme y otros que no experimento como propios." },
  { index: 22, text: "Siento que mi percepción del tiempo cambia y las cosas parecen suceder a cámara lenta o aceleradas." },
];

// Configuración de scoring por escalas
const DCI_SCORING = {
  DET: {
    items: [1, 2, 3, 4, 7, 11, 12, 18, 19, 22],
    label: "Distanciamiento",
    description: "Experiencias de distanciamiento del presente y de la realidad",
  },
  COM: {
    items: [5, 6, 9, 10, 13, 14, 16, 17, 20, 21],
    label: "Compartimentación",
    description: "División de partes del self o experiencias fragmentadas",
  },
  VAL: {
    items: [8, 15],
    label: "Validez",
    description: "Indicador de aquiescencia o respuesta aleatoria",
  },
};

export function getDCITemplateData(): DCITemplateData {
  return {
    code: "DCI",
    name: "DCI - Inventario de Distanciamiento y Compartimentación",
    description: "Evaluación de experiencias disociativas: distanciamiento del presente y compartimentación del self. Adaptación española de Butler et al. (2019).",
    version: 1,
    response_min: 0,
    response_max: 7,
    min_label: "Nunca",
    max_label: "Diariamente",
    items: DCI_ITEMS,
    scoring: DCI_SCORING,
    instructions: `Por favor, indique con qué frecuencia le ocurren las siguientes experiencias.

Use la siguiente escala de frecuencia:
0 = Nunca
1 = Una o dos veces en mi vida
2 = No más de una vez al año
3 = Una vez cada pocos meses
4 = Al menos una vez al mes
5 = Al menos una vez a la semana
6 = Varias veces a la semana
7 = Diariamente

Responda con sinceridad basándose en sus experiencias habituales.`,
    flag_threshold: 17.50, // Punto de corte de Distanciamiento
    chart_full_mark: 70, // Máximo posible por escala (10 items × 7)
  };
}

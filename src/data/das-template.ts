/**
 * DAS - Escala de Ajuste Diádico
 * Original: Spanier (1976)
 * Adaptación española: © TEA Ediciones (2017)
 *
 * Cada opción guarda el valor de la hoja de corrección, así que la respuesta
 * ya es la puntuación del ítem. Las opciones van en el orden del cuadernillo.
 * La puntuación y los baremos viven en supabase/functions/_shared/dasScoring.ts.
 */

export interface DASOption {
  value: number;
  text: string;
}

export interface DASItem {
  index: number;
  text: string;
  label: string;
  options: DASOption[];
}

const opts = (labels: string[], values: number[]): DASOption[] =>
  labels.map((text, i) => ({ value: values[i], text }));

const AGREEMENT = opts(
  ['Siempre de acuerdo', 'Casi siempre de acuerdo', 'Desacuerdo ocasional', 'Desacuerdo frecuente', 'Casi siempre en desacuerdo', 'Siempre en desacuerdo'],
  [5, 4, 3, 2, 1, 0],
);

const FREQUENCY_LABELS = ['Siempre', 'Casi siempre', 'Bastante a menudo', 'Ocasionalmente', 'Casi nunca', 'Nunca'];
const FREQUENCY_NEGATIVE = opts(FREQUENCY_LABELS, [0, 1, 2, 3, 4, 5]);
const FREQUENCY_POSITIVE = opts(FREQUENCY_LABELS, [5, 4, 3, 2, 1, 0]);

const SHARED = opts(
  ['Nunca', 'Menos de una vez al mes', 'Una o dos veces al mes', 'Una o dos veces por semana', 'Una vez al día', 'Más a menudo'],
  [0, 1, 2, 3, 4, 5],
);

const YES_NO = opts(['Sí', 'No'], [0, 1]);

const agreementItem = (index: number, text: string): DASItem => ({
  index,
  text,
  label: `Grado de acuerdo con su pareja: ${text}`,
  options: AGREEMENT,
});

const sharedItem = (index: number, text: string): DASItem => ({
  index,
  text,
  label: `¿Con qué frecuencia ocurre entre usted y su pareja? ${text}`,
  options: SHARED,
});

const problemItem = (index: number, text: string): DASItem => ({
  index,
  text,
  label: `En las últimas semanas, ¿esto ha creado diferencias de opinión o ha supuesto algún problema entre ustedes? ${text}`,
  options: YES_NO,
});

const plain = (index: number, text: string, options: DASOption[]): DASItem => ({
  index,
  text,
  label: text,
  options,
});

export const DAS_ITEMS: DASItem[] = [
  agreementItem(1, 'Administración de la economía doméstica'),
  agreementItem(2, 'Ocio'),
  agreementItem(3, 'Cuestiones religiosas'),
  agreementItem(4, 'Demostraciones de afecto'),
  agreementItem(5, 'Amigos'),
  agreementItem(6, 'Relaciones sexuales'),
  agreementItem(7, 'Conductas convencionales (normas de educación)'),
  agreementItem(8, 'Filosofía de vida'),
  agreementItem(9, 'Trato con los padres o suegros'),
  agreementItem(10, 'Objetivos, metas y cosas que se consideran importantes'),
  agreementItem(11, 'Cantidad de tiempo que pasan juntos'),
  agreementItem(12, 'Toma de decisiones importantes'),
  agreementItem(13, 'Tareas domésticas'),
  agreementItem(14, 'Intereses y actividades para el tiempo libre'),
  agreementItem(15, 'Toma de decisiones profesionales (cambios de trabajo, ascensos, etc.)'),
  plain(16, '¿Con qué frecuencia han hablado o considerado el divorcio, la separación o el fin de su relación?', FREQUENCY_NEGATIVE),
  plain(17, '¿Con qué frecuencia usted o su pareja salen de casa tras una pelea?', FREQUENCY_NEGATIVE),
  plain(18, 'En general, ¿con qué frecuencia piensa que las cosas entre usted y su pareja van bien?', FREQUENCY_POSITIVE),
  plain(19, '¿Hace confidencias a su pareja?', FREQUENCY_POSITIVE),
  plain(20, '¿Lamenta alguna vez haberse casado (o vivir) con su pareja?', FREQUENCY_NEGATIVE),
  plain(21, '¿Con qué frecuencia discuten?', FREQUENCY_NEGATIVE),
  plain(22, '¿Con qué frecuencia uno pone nervioso al otro?', FREQUENCY_NEGATIVE),
  plain(23, '¿Besa a su pareja?', opts(
    ['Todos los días', 'Casi todos los días', 'Ocasionalmente', 'Raramente', 'Nunca'],
    [4, 3, 2, 1, 0],
  )),
  plain(24, '¿Participan juntos en actividades fuera del hogar?', opts(
    ['En todas', 'En la mayoría', 'En algunas', 'En muy pocas', 'En ninguna'],
    [4, 3, 2, 1, 0],
  )),
  sharedItem(25, 'Tienen un intercambio interesante de ideas'),
  sharedItem(26, 'Se ríen juntos'),
  sharedItem(27, 'Hablan con calma sobre algo'),
  sharedItem(28, 'Trabajan juntos en un proyecto'),
  problemItem(29, 'Estar demasiado cansado o cansada para tener relaciones sexuales'),
  problemItem(30, 'No demostrar afecto'),
  {
    index: 31,
    text: 'Grado de satisfacción global con la relación',
    label: 'Considerando su relación de forma global, ¿hasta qué punto está contento/a con ella? El punto medio ("contento/a") representa el grado de satisfacción de la mayoría de las relaciones.',
    options: opts(
      ['Muy descontento/a', 'Bastante descontento/a', 'Un poco descontento/a', 'Contento/a', 'Muy contento/a', 'Contentísimo/a', 'Maravilloso'],
      [0, 1, 2, 3, 4, 5, 6],
    ),
  },
  {
    index: 32,
    text: 'Cómo se siente sobre el futuro de su relación',
    label: '¿Cuál de las siguientes afirmaciones describe mejor cómo se siente sobre el futuro de su relación?',
    options: opts(
      [
        'Deseo con todas mis fuerzas que mi relación progrese de forma satisfactoria y haría cualquier cosa para que así fuera.',
        'Deseo de veras que mi relación progrese de forma satisfactoria y haré todo lo que pueda para que así sea.',
        'Deseo de veras que mi relación progrese de forma satisfactoria y haré lo justo para que así sea.',
        'Estaría bien que mi relación progresara de forma satisfactoria, pero no puedo hacer mucho más de lo que ahora hago para que así sea.',
        'Estaría bien que progresara de forma satisfactoria, pero me niego a hacer más de lo que ahora hago para que mi relación siga adelante.',
        'Mi relación no puede progresar de forma satisfactoria y no hay nada más que yo pueda hacer para que así sea.',
      ],
      [5, 4, 3, 2, 1, 0],
    ),
  },
];

export const DAS_SCORING = {
  CON: {
    items: [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    label: 'Consenso',
    description: 'Grado de acuerdo de la pareja en asuntos importantes de la relación',
  },
  SAT: {
    items: [16, 17, 18, 19, 20, 21, 22, 23, 31, 32],
    label: 'Satisfacción',
    description: 'Satisfacción con la relación y compromiso con su continuidad',
  },
  EXP: {
    items: [4, 6, 29, 30],
    label: 'Expresión afectiva',
    description: 'Acuerdo y satisfacción con las demostraciones de afecto y la sexualidad',
  },
  COH: {
    items: [24, 25, 26, 27, 28],
    label: 'Cohesión',
    description: 'Actividades e intereses compartidos por la pareja',
  },
};

export function getDASTemplateData() {
  return {
    code: 'DAS',
    name: 'DAS - Escala de Ajuste Diádico',
    description: 'Evaluación de la calidad de la relación de pareja: consenso, satisfacción, expresión afectiva y cohesión. Adaptación española de TEA Ediciones.',
    version: 1,
    response_min: 0,
    response_max: 6,
    min_label: '',
    max_label: '',
    items: DAS_ITEMS,
    scoring: DAS_SCORING,
    instructions: `En algunas ocasiones las parejas están en desacuerdo con ciertos temas.

A continuación se le presentarán varias cuestiones sobre la vida en pareja. Usted deberá valorar el grado de acuerdo que tienen usted y su pareja sobre ellas o la frecuencia con que se dan ciertas situaciones o las piensa.

Para cada cuestión, elija la opción que más se ajuste a su situación.`,
    flag_threshold: 40,
    chart_full_mark: 80,
    is_active: true,
    interpretations: null,
  };
}

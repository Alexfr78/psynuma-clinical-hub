export interface DESTemplateData {
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
  is_active: boolean;
  interpretations: null;
}

export function getDESTemplateData(): DESTemplateData {
  return {
    code: 'DES',
    name: 'DES - Escala de Experiencias Disociativas',
    description: 'Escala de 28 ítems para evaluar experiencias disociativas. Desarrollada por E. Bernstein Carlson y F. Putnam.',
    version: 1,
    response_min: 0,
    response_max: 100,
    min_label: 'Nunca (0%)',
    max_label: 'Siempre (100%)',
    flag_threshold: 30, // Mean >= 30 indicates probable dissociative disorder
    chart_full_mark: 100,
    is_active: true,
    interpretations: null,
    instructions: `Este cuestionario contiene 28 preguntas acerca de experiencias que usted puede haber tenido en su vida diaria. Nos interesa saber con qué frecuencia le ocurren estas experiencias.

Para contestar, por favor determine en qué grado cada experiencia descrita en la pregunta le ocurre a usted e indique el porcentaje del tiempo que le sucede (0% = Nunca, 100% = Siempre).

Es importante que sus respuestas muestren con qué frecuencia estas experiencias le ocurren cuando NO está bajo la influencia del alcohol o drogas.`,
    items: [
      { index: 1, text: 'Algunas personas tienen la experiencia de estar conduciendo un coche o en un autobús o metro y de pronto se dan cuenta de que no recuerdan lo que pasó durante todo el viaje o una parte del mismo.' },
      { index: 2, text: 'Algunas personas encuentran que a veces están escuchando a alguien hablar y de pronto se dan cuenta de que no han oído una parte o todo lo que se dijo.' },
      { index: 3, text: 'Algunas personas tienen la experiencia de encontrarse en un lugar y no saber cómo llegaron hasta allí.' },
      { index: 4, text: 'Algunas personas tienen la experiencia de encontrarse vestidas con ropa que no recuerdan haberse puesto.' },
      { index: 5, text: 'Algunas personas tienen la experiencia de encontrar entre sus pertenencias objetos nuevos que no recuerdan haber comprado.' },
      { index: 6, text: 'Algunas personas encuentran que a veces son abordadas por gente que no conocen que les llama por otro nombre o que insiste en que se han conocido antes.' },
      { index: 7, text: 'Algunas personas tienen la experiencia de sentirse como si estuvieran de pie al lado de sí mismas o viéndose a sí mismas hacer algo y de hecho se ven a sí mismas como si estuvieran observando a otra persona.' },
      { index: 8, text: 'Algunas personas a veces no reconocen a parientes o amigos.' },
      { index: 9, text: 'Algunas personas encuentran que no tienen ningún recuerdo de algunos momentos importantes de su vida (por ejemplo, boda, graduación).' },
      { index: 10, text: 'Algunas personas tienen la experiencia de ser acusadas de mentir cuando ellas no creen que lo hayan hecho.' },
      { index: 11, text: 'Algunas personas tienen la experiencia de mirarse al espejo y no reconocerse.' },
      { index: 12, text: 'Algunas personas tienen la experiencia de sentir que las demás personas, objetos y el mundo de su alrededor no son reales.' },
      { index: 13, text: 'Algunas personas tienen la experiencia de sentir que su cuerpo no les pertenece.' },
      { index: 14, text: 'Algunas personas tienen la experiencia de a veces revivir un suceso del pasado tan vívidamente que es como si lo volvieran a vivir o lo estuvieran viendo.' },
      { index: 15, text: 'Algunas personas tienen la experiencia de no estar seguras de si las cosas que recuerdan que sucedieron, realmente sucedieron o si sólo las soñaron.' },
      { index: 16, text: 'Algunas personas tienen la experiencia de estar en un lugar conocido pero encontrándolo extraño y desconocido.' },
      { index: 17, text: 'Algunas personas encuentran que cuando están viendo televisión o una película, quedan tan absortas en la historia que no se dan cuenta de otras cosas que pasan a su alrededor.' },
      { index: 18, text: 'Algunas personas encuentran que quedan tan envueltas en una fantasía o en un ensueño que les parece como si realmente les estuviera sucediendo a ellas.' },
      { index: 19, text: 'Algunas personas encuentran que a veces son capaces de ignorar el dolor.' },
      { index: 20, text: 'Algunas personas encuentran que a veces se sientan mirando un punto fijo, sin pensar en nada y no se dan cuenta del tiempo que ha transcurrido.' },
      { index: 21, text: 'Algunas personas encuentran que a veces, cuando están solas, hablan en voz alta consigo mismas.' },
      { index: 22, text: 'Algunas personas encuentran que en una situación pueden actuar de manera tan diferente comparado con otra situación que sienten como si fueran dos personas diferentes.' },
      { index: 23, text: 'Algunas personas encuentran que a veces en ciertas situaciones son capaces de hacer cosas con asombrosa facilidad y espontaneidad que usualmente les son difíciles (por ejemplo, deportes, trabajo, situaciones sociales).' },
      { index: 24, text: 'Algunas personas encuentran que a veces no pueden recordar si han hecho algo o sólo pensaron en hacerlo (por ejemplo, no saber si mandaron una carta o sólo pensaron en mandarla).' },
      { index: 25, text: 'Algunas personas encuentran evidencias de que han hecho cosas que no recuerdan haber hecho.' },
      { index: 26, text: 'Algunas personas a veces encuentran escritos, dibujos o notas entre sus pertenencias que debieron haber hecho ellas, pero que no pueden recordar haberlos hecho.' },
      { index: 27, text: 'Algunas personas encuentran que a veces oyen voces en su cabeza que les dicen que hagan cosas o que comentan sobre cosas que están haciendo.' },
      { index: 28, text: 'Algunas personas tienen la experiencia de sentir como si estuvieran mirando al mundo a través de una niebla, de manera que las personas y objetos aparecen lejanos o no claros.' },
    ],
    scoring: {
      DES_A: {
        items: [3, 4, 5, 6, 8, 10, 25, 26],
        label: 'Amnesia Disociativa',
        description: 'Experiencias de pérdida de memoria y lagunas temporales',
      },
      DES_D: {
        items: [7, 11, 12, 13, 16, 28],
        label: 'Despersonalización/Desrealización',
        description: 'Sensación de irrealidad o extrañeza del cuerpo y el entorno',
      },
      DES_I: {
        items: [2, 14, 15, 17, 18, 20],
        label: 'Absorción/Imaginación',
        description: 'Absorción en experiencias internas, fantasías y ensoñaciones',
      },
      DES_T: {
        items: [3, 5, 7, 8, 12, 13, 22, 27],
        label: 'Taxón Disociativo',
        description: 'Indicador de disociación patológica',
      },
    },
  };
}

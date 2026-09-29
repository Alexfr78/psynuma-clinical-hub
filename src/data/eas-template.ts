/**
 * EAS - Escala del modelo triangular del amor
 * Sternberg (1997) - Adaptación
 *
 * En el original un espacio en blanco representa a la persona con la que se
 * mantiene la relación; aquí se escribe "mi pareja". La puntuación vive en
 * supabase/functions/_shared/easScoring.ts.
 */

import { EAS_COMPONENT_ITEMS } from '../../supabase/functions/_shared/easScoring';

export const EAS_ITEMS: { index: number; text: string }[] = [
  { index: 1, text: 'Prefiero estar con mi pareja antes que con cualquier otra persona.' },
  { index: 2, text: 'Tengo una relación cálida con mi pareja.' },
  { index: 3, text: 'Me comunico bien con mi pareja.' },
  { index: 4, text: 'Apoyo activamente el bienestar de mi pareja.' },
  { index: 5, text: 'No puedo imaginarme que otra persona pueda hacerme tan feliz como mi pareja.' },
  { index: 6, text: 'Planeo continuar mi relación con mi pareja.' },
  { index: 7, text: 'Siempre sentiré una gran responsabilidad hacia mi pareja.' },
  { index: 8, text: 'No hay nada más importante para mí que mi relación con mi pareja.' },
  { index: 9, text: 'Siento que mi pareja realmente me comprende.' },
  { index: 10, text: 'Estoy dispuesto/a a entregarme y a compartir mis posesiones con mi pareja.' },
  { index: 11, text: 'Mi relación con mi pareja es muy romántica.' },
  { index: 12, text: 'Aún en los momentos en que resulta difícil tratar con mi pareja, permanezco comprometido/a con nuestra relación.' },
  { index: 13, text: 'Existe algo casi «mágico» en mi relación con mi pareja.' },
  { index: 14, text: 'Permanecería con mi pareja incluso en tiempos difíciles.' },
  { index: 15, text: 'Idealizo a mi pareja.' },
  { index: 16, text: 'Estoy seguro/a de mi amor por mi pareja.' },
  { index: 17, text: 'Siento que realmente comprendo a mi pareja.' },
  { index: 18, text: 'Recibo considerable apoyo emocional de mi pareja.' },
  { index: 19, text: 'No puedo imaginarme la vida sin mi pareja.' },
  { index: 20, text: 'Sé que tengo que cuidar de mi pareja.' },
  { index: 21, text: 'Adoro a mi pareja.' },
  { index: 22, text: 'Puedo contar con mi pareja en momentos de necesidad.' },
  { index: 23, text: 'Espero que mi amor por mi pareja se mantenga durante el resto de mi vida.' },
  { index: 24, text: 'No puedo imaginar la ruptura de mi relación con mi pareja.' },
  { index: 25, text: 'Tengo una relación cómoda con mi pareja.' },
  { index: 26, text: 'Disfruto especialmente del contacto físico con mi pareja.' },
  { index: 27, text: 'Considero mi relación con mi pareja permanente.' },
  { index: 28, text: 'Cuando veo películas románticas o leo libros románticos pienso en mi pareja.' },
  { index: 29, text: 'Considero mi relación con mi pareja una buena decisión.' },
  { index: 30, text: 'Mi pareja puede contar conmigo en momentos de necesidad.' },
  { index: 31, text: 'Me siento emocionalmente próximo/a a mi pareja.' },
  { index: 32, text: 'Me encuentro pensando en mi pareja frecuentemente todo el día.' },
  { index: 33, text: 'No podría permitir que algo se interpusiera en mi compromiso con mi pareja.' },
  { index: 34, text: 'Doy considerable apoyo emocional a mi pareja.' },
  { index: 35, text: 'El solo hecho de ver a mi pareja me excita.' },
  { index: 36, text: 'Considero sólido mi compromiso con mi pareja.' },
  { index: 37, text: 'Fantaseo con mi pareja.' },
  { index: 38, text: 'Experimento una real felicidad con mi pareja.' },
  { index: 39, text: 'Siento responsabilidad hacia mi pareja.' },
  { index: 40, text: 'Mi relación con mi pareja es muy apasionada.' },
  { index: 41, text: 'Comparto información profundamente personal acerca de mí mismo/a con mi pareja.' },
  { index: 42, text: 'Encuentro a mi pareja muy atractivo/a personalmente.' },
  { index: 43, text: 'Tengo confianza en la estabilidad de mi relación con mi pareja.' },
  { index: 44, text: 'Debido a mi compromiso con mi pareja, no dejaría que otras personas se inmiscuyeran entre nosotros.' },
  { index: 45, text: 'Valoro a mi pareja en gran medida dentro de mi vida.' },
];

export const EAS_SCORING = {
  INT: {
    items: EAS_COMPONENT_ITEMS.INT,
    label: 'Intimidad',
    description: 'Cercanía, conexión, confianza y apoyo emocional en la relación',
  },
  PAS: {
    items: EAS_COMPONENT_ITEMS.PAS,
    label: 'Pasión',
    description: 'Atracción, romance, deseo y activación física',
  },
  COM: {
    items: EAS_COMPONENT_ITEMS.COM,
    label: 'Compromiso',
    description: 'Decisión de mantener la relación y responsabilidad hacia ella a largo plazo',
  },
};

export function getEASTemplateData() {
  return {
    code: 'EAS',
    name: 'EAS - Escala del amor de Sternberg',
    description: 'Escala del modelo triangular del amor (Sternberg, 1997). Evalúa intimidad, pasión y compromiso en la relación de pareja.',
    version: 1,
    response_min: 1,
    response_max: 9,
    min_label: 'En absoluto',
    max_label: 'Extremadamente',
    items: EAS_ITEMS,
    scoring: EAS_SCORING,
    instructions: `Las afirmaciones se refieren a la persona con la que mantiene una relación. Califique cada una en una escala del 1 al 9, en la cual:

1 = en absoluto
3 = algo
5 = moderadamente
7 = bastante
9 = extremadamente

Utilice las puntuaciones intermedias (2, 4, 6, 8) para indicar niveles intermedios de sentimientos.`,
    flag_threshold: 0,
    chart_full_mark: 135,
    is_active: true,
    interpretations: null,
  };
}

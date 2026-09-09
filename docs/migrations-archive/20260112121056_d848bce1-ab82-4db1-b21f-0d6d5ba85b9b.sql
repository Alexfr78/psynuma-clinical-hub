-- Update the SELFCARE assessment template with the official items from the published scale
-- González-Vazquez, A. I., Mosquera-Barral, D., Knipe, J., Leeds, A. M., & Santed-German, M. A. (2018)
-- Construction and Initial Validation of a Scale to Evaluate Self-Care Patterns: The Self-Care Scale
-- Clinical Neuropsychiatry, 15(6), 373–378

UPDATE public.assessment_templates
SET 
  name = 'Escala de Autocuidado',
  description = 'Escala de Autocuidado (González, Mosquera, Knipe, Leeds, Santed, 2018). Evalúa patrones de autocuidado en 6 dimensiones: conducta autodestructiva, tolerancia al afecto positivo, problemas para dejarse ayudar, resentimiento por no reciprocidad, actividades positivas y atención a las propias necesidades.',
  instructions = 'La escala de autocuidado se refiere a formas en las que habitualmente nos tratamos a nosotros mismos. Esto abarca distintas áreas.

Deberá leer cada frase, y ver hasta qué punto está de acuerdo con ella, según la siguiente escala:

1 = Totalmente en desacuerdo
2 = Bastante en desacuerdo
3 = Algo en desacuerdo
4 = Ni de acuerdo ni en desacuerdo
5 = Algo de acuerdo
6 = Bastante de acuerdo
7 = Totalmente de acuerdo

Conteste en base a la manera en la que funciona usted de modo habitual, no a una etapa en particular.

Por favor, no deje ninguna pregunta sin responder.',
  items = '[
    {"index": 1, "text": "Cuando estoy mal hago cosas que me hacen sentir aún peor", "factor": "AD"},
    {"index": 2, "text": "Los elogios me hacen sentir incómodo", "factor": "TA"},
    {"index": 3, "text": "No me dejo ayudar", "factor": "PA"},
    {"index": 4, "text": "Siento que me tratan injustamente y no sé por qué", "factor": "R"},
    {"index": 5, "text": "No dedico tiempo a actividades agradables o divertidas", "factor": "NP"},
    {"index": 6, "text": "No me fío de la gente que me dice cosas positivas sobre mí", "factor": "TA"},
    {"index": 7, "text": "Las cosas que hago tienen que ser útiles a otras personas", "factor": "NN"},
    {"index": 8, "text": "Echo siempre la culpa de todo", "factor": "AD"},
    {"index": 9, "text": "Nadie me reconoce lo mucho que hago por ellos", "factor": "R"},
    {"index": 10, "text": "Las necesidades de los demás están por delante de las mías", "factor": "NN"},
    {"index": 11, "text": "No soy capaz de pedir ayuda", "factor": "PA"},
    {"index": 12, "text": "Me comporto de forma autodestructiva", "factor": "AD"},
    {"index": 13, "text": "Los demás deberían estar ahí cuando los necesito", "factor": "R"},
    {"index": 14, "text": "Puedo llegar a disculpar cualquier cosa que me hagan", "factor": "NN"},
    {"index": 15, "text": "Creo más fácilmente una crítica que un cumplido", "factor": "TA"},
    {"index": 16, "text": "Critico internamente todo el tiempo", "factor": "AD"},
    {"index": 17, "text": "Mis problemas me los guardo para mí", "factor": "R"},
    {"index": 18, "text": "La gente es muy desagradecida", "factor": "NN"},
    {"index": 19, "text": "Me cuesta defender mis derechos", "factor": "AD"},
    {"index": 20, "text": "Me siento más cómodo ayudando a los demás que a la inversa", "factor": "TA"},
    {"index": 21, "text": "No tengo relaciones que me resulten gratificantes", "factor": "NP"},
    {"index": 22, "text": "Permito que la gente invada mi espacio personal", "factor": "NN"},
    {"index": 23, "text": "Hago cosas que sé que me perjudican", "factor": "AD"},
    {"index": 24, "text": "Me molesta que los demás no respondan en seguida a mis necesidades", "factor": "R"},
    {"index": 25, "text": "No hago ejercicio físico", "factor": "NP"},
    {"index": 26, "text": "Soy incapaz de decir que no", "factor": "NN"},
    {"index": 27, "text": "Neutralizo los cumplidos diciendo \"no es para tanto\" o cosas así", "factor": "TA"},
    {"index": 28, "text": "Cuando estoy mal me enfado conmigo mismo por estar así", "factor": "AD"},
    {"index": 29, "text": "No puedo pedir lo que necesito", "factor": "PA"},
    {"index": 30, "text": "No sé disfrutar del tiempo libre", "factor": "NP"},
    {"index": 31, "text": "Me alimento mal", "factor": "AD"}
  ]'::jsonb,
  scoring = '{
    "AD": {"items": [1, 8, 12, 16, 19, 23, 28, 31], "label": "Conducta autodestructiva", "description": "Patrones de comportamiento que resultan perjudiciales para uno mismo"},
    "TA": {"items": [2, 6, 15, 20, 27], "label": "Falta de tolerancia al afecto positivo", "description": "Dificultad para aceptar y tolerar experiencias emocionales positivas"},
    "PA": {"items": [3, 11, 29], "label": "Problemas para dejarse ayudar", "description": "Dificultad para solicitar o aceptar ayuda de otros"},
    "R": {"items": [4, 9, 13, 17, 24], "label": "Resentimiento por no reciprocidad", "description": "Sentimientos de injusticia relacionados con la falta de reciprocidad percibida"},
    "NP": {"items": [5, 21, 25, 30], "label": "No actividades positivas", "description": "Ausencia de actividades gratificantes o de autocuidado activo"},
    "NN": {"items": [7, 10, 14, 18, 22, 26], "label": "No atender las propias necesidades", "description": "Tendencia a priorizar las necesidades de otros sobre las propias"}
  }'::jsonb,
  interpretations = '{
    "AD": {
      "interpretation": "Puntuaciones elevadas en Conducta Autodestructiva indican patrones de comportamiento que resultan perjudiciales para la persona, como autoculparse, autocriticarse, no defender los propios derechos, alimentarse mal o realizar acciones que se sabe que son dañinas.",
      "intervention": "Trabajo en autocompasión, identificación de patrones autodestructivos, desarrollo de alternativas saludables, trabajo con las partes críticas internas."
    },
    "TA": {
      "interpretation": "Puntuaciones elevadas en Falta de Tolerancia al Afecto Positivo indican dificultad para aceptar elogios, experiencias positivas o reconocimiento. La persona puede sentirse incómoda cuando recibe feedback positivo o tender a neutralizarlo.",
      "intervention": "Trabajo gradual con experiencias positivas, identificación de creencias limitantes sobre merecer cosas buenas, ejercicios de tolerancia afectiva positiva."
    },
    "PA": {
      "interpretation": "Puntuaciones elevadas en Problemas para Dejarse Ayudar indican dificultad para solicitar ayuda, aceptar apoyo de otros o expresar las propias necesidades.",
      "intervention": "Trabajo en asertividad, exploración de creencias sobre pedir ayuda, práctica gradual de solicitar apoyo en situaciones seguras."
    },
    "R": {
      "interpretation": "Puntuaciones elevadas en Resentimiento por No Reciprocidad indican sentimientos de injusticia, percepción de falta de reconocimiento o expectativas no cumplidas en las relaciones.",
      "intervention": "Trabajo en expectativas relacionales, comunicación asertiva de necesidades, exploración de patrones de dar-recibir en relaciones."
    },
    "NP": {
      "interpretation": "Puntuaciones elevadas en No Actividades Positivas indican ausencia de actividades gratificantes, dificultad para disfrutar del tiempo libre, falta de ejercicio físico o relaciones poco satisfactorias.",
      "intervention": "Planificación de actividades agradables, identificación de barreras para el disfrute, activación conductual gradual."
    },
    "NN": {
      "interpretation": "Puntuaciones elevadas en No Atender las Propias Necesidades indican una tendencia a priorizar a los demás, dificultad para poner límites, permitir invasiones del espacio personal o ser incapaz de decir no.",
      "intervention": "Trabajo en límites personales, identificación de necesidades propias, práctica de decir no, exploración de creencias sobre el cuidado de uno mismo."
    }
  }'::jsonb,
  response_min = 1,
  response_max = 7,
  min_label = 'Totalmente en desacuerdo',
  max_label = 'Totalmente de acuerdo',
  flag_threshold = 3,
  chart_full_mark = 7,
  updated_at = now()
WHERE code = 'SELFCARE_V1';
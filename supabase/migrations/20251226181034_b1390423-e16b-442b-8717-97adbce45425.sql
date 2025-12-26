-- Seed SELFCARE_V1 template for all existing centers
INSERT INTO public.assessment_templates (center_id, code, name, description, version, items, scoring, instructions, interpretations, is_active)
SELECT 
  c.id,
  'SELFCARE_V1',
  'Escala de Autocuidado',
  'Evaluación del patrón de autocuidado personal (31 ítems, escala Likert 1-7)',
  1,
  '[
    {"index": 1, "text": "Suelo responsabilizarme de los problemas de los demás"},
    {"index": 2, "text": "Me cuesta aceptar los cumplidos"},
    {"index": 3, "text": "Me cuesta pedir ayuda"},
    {"index": 4, "text": "A veces siento que la vida no es justa conmigo"},
    {"index": 5, "text": "Me cuesta disfrutar de las cosas buenas que me pasan"},
    {"index": 6, "text": "Me siento incómodo/a cuando me hacen regalos"},
    {"index": 7, "text": "Antepongo las necesidades de los demás a las mías"},
    {"index": 8, "text": "Siento que debo estar disponible para los demás"},
    {"index": 9, "text": "Siento que los demás no me valoran lo suficiente"},
    {"index": 10, "text": "Me cuesta decir que no"},
    {"index": 11, "text": "Prefiero resolver mis problemas solo/a"},
    {"index": 12, "text": "Tiendo a cuidar más de los demás que de mí mismo/a"},
    {"index": 13, "text": "Me siento resentido/a cuando no recibo lo que merezco"},
    {"index": 14, "text": "Me siento culpable si dedico tiempo a mí mismo/a"},
    {"index": 15, "text": "Me incomoda recibir ayuda de otros"},
    {"index": 16, "text": "Pongo las expectativas de otros por encima de las mías"},
    {"index": 17, "text": "Siento que pedir ayuda es un signo de debilidad"},
    {"index": 18, "text": "A menudo siento que las cosas no salen como deberían"},
    {"index": 19, "text": "Me resulta difícil expresar mis propias necesidades"},
    {"index": 20, "text": "Me siento mal cuando otros hacen cosas por mí"},
    {"index": 21, "text": "Me cuesta permitirme momentos de placer sin sentir culpa"},
    {"index": 22, "text": "Suelo sacrificar mis deseos por los de los demás"},
    {"index": 23, "text": "Siento que debo demostrar mi valía constantemente"},
    {"index": 24, "text": "Tengo la sensación de que doy más de lo que recibo"},
    {"index": 25, "text": "No me permito descansar hasta que todo esté hecho"},
    {"index": 26, "text": "Minimizo mis propias necesidades emocionales"},
    {"index": 27, "text": "Me resulta difícil aceptar elogios sobre mi persona"},
    {"index": 28, "text": "Siento que mi valor depende de cuánto hago por otros"},
    {"index": 29, "text": "Me cuesta confiar en que otros me ayudarán"},
    {"index": 30, "text": "Me privo de placeres porque siento que no los merezco"},
    {"index": 31, "text": "Me exijo más de lo que exigiría a los demás"}
  ]'::jsonb,
  '{
    "AD": {"items": [1,8,12,16,23,28,31], "label": "Autocuidado deficitario", "description": "Patrón de cuidar más a otros que a uno mismo"},
    "TA": {"items": [2,6,15,20,27], "label": "Tolerancia afectiva", "description": "Dificultad para recibir afecto y reconocimiento"},
    "PA": {"items": [3,11,17,29], "label": "Pedir ayuda", "description": "Resistencia a solicitar apoyo de otros"},
    "R": {"items": [4,9,13,18,24], "label": "Resentimiento", "description": "Sensación de injusticia y falta de reciprocidad"},
    "NP": {"items": [5,21,25,30], "label": "No permitirse placer", "description": "Dificultad para disfrutar sin culpa"},
    "NN": {"items": [7,10,14,19,22,26], "label": "Negar necesidades", "description": "Tendencia a minimizar las propias necesidades"}
  }'::jsonb,
  'A continuación encontrarás una serie de afirmaciones sobre cómo te relacionas contigo mismo/a y con los demás. 

Por favor, indica en qué medida cada afirmación te describe, siendo:
1 = Nada de acuerdo
7 = Totalmente de acuerdo

No hay respuestas correctas o incorrectas. Responde según cómo te sientes habitualmente.',
  '{
    "AD": {
      "interpretation": "Patrón de autocuidado invertido: tendencia a priorizar el cuidado de otros sobre el propio bienestar, con posible origen en experiencias tempranas donde cuidar era la forma de obtener validación.",
      "intervention": "Trabajar autocuidado cognitivo, explorar origen de la voz crítica interna, técnica de \"mirar con amor al niño interior\", identificar y reducir conductas de riesgo para el propio bienestar."
    },
    "TA": {
      "interpretation": "Dificultad para asimilar reconocimiento positivo: posible creencia de no merecer afecto o desconfianza ante muestras de cariño.",
      "intervention": "Procesar bloqueos ante el elogio, explorar recursos internos, trabajar vergüenza y vulnerabilidad en el vínculo terapéutico."
    },
    "PA": {
      "interpretation": "Pedir ayuda percibido como peligro: posible historia de negligencia o rechazo ante solicitudes de apoyo.",
      "intervention": "Construir seguridad en el vínculo terapéutico, validar la necesidad de apoyo, reestructurar creencia de debilidad asociada a pedir ayuda."
    },
    "R": {
      "interpretation": "Sensación persistente de injusticia: acumulación de experiencias de dar sin recibir, posible dificultad para establecer límites.",
      "intervention": "Ajustar expectativas de reciprocidad, diferenciar pasado y presente, trabajar responsabilidad propia en patrones relacionales."
    },
    "NP": {
      "interpretation": "Creencia de no merecer disfrutar: posible culpa asociada al placer, aprendizaje de que el disfrute es egoísta.",
      "intervention": "Programación de actividades agradables, explorar culpa asociada al placer, trabajar permiso interno para disfrutar."
    },
    "NN": {
      "interpretation": "Rol cuidador hipertrofiado: tendencia a negar o minimizar las propias necesidades en favor de las de otros.",
      "intervention": "Entrenamiento en asertividad, establecimiento de límites saludables, legitimación de las propias necesidades emocionales."
    }
  }'::jsonb,
  true
FROM public.centers c
ON CONFLICT (center_id, code) DO NOTHING;
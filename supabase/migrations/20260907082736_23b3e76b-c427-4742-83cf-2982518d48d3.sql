CREATE TABLE IF NOT EXISTS public.ai_document_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     uuid REFERENCES public.centers(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  description   text,
  audience      text NOT NULL,
  scope         text NOT NULL DEFAULT 'session',
  requires      text[] NOT NULL DEFAULT '{}',
  sections      jsonb NOT NULL DEFAULT '[]',
  input_schema  jsonb NOT NULL DEFAULT '{}',
  required_consent_purposes text[] NOT NULL DEFAULT '{ai_processing,report_generation}',
  mirror_column text,
  default_user_prompt text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_document_types_center_key_uidx
  ON public.ai_document_types (
    coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type_id uuid NOT NULL REFERENCES public.ai_document_types(id) ON DELETE CASCADE,
  center_id        uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  version          int  NOT NULL,
  system_prompt    text,
  user_prompt      text NOT NULL,
  model            text,
  temperature      real,
  professional_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_type_id  uuid REFERENCES public.session_types(id) ON DELETE CASCADE,
  is_published     boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type_id, center_id, version)
);

CREATE TABLE IF NOT EXISTS public.ai_generated_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id          uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  session_id         uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  patient_id         uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_type_id   uuid NOT NULL REFERENCES public.ai_document_types(id),
  prompt_version_id  uuid REFERENCES public.ai_prompt_versions(id) ON DELETE SET NULL,
  source_session_ids uuid[] NOT NULL DEFAULT '{}',
  content_sections   jsonb NOT NULL,
  content_markdown   text  NOT NULL,
  edited_sections    jsonb,
  edited_markdown    text,
  transcript_source  text,
  plaud_recording_id uuid,
  model_used         text,
  tokens_in          int,
  tokens_out         int,
  generated_by       uuid REFERENCES public.profiles(id),
  generated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_document_types TO authenticated;
GRANT ALL ON public.ai_document_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_versions TO authenticated;
GRANT ALL ON public.ai_prompt_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_generated_documents TO authenticated;
GRANT ALL ON public.ai_generated_documents TO service_role;

CREATE INDEX IF NOT EXISTS ai_generated_documents_session_type_idx
  ON public.ai_generated_documents (session_id, document_type_id);

CREATE INDEX IF NOT EXISTS ai_generated_documents_patient_generated_at_idx
  ON public.ai_generated_documents (patient_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS ai_prompt_versions_precedence_idx
  ON public.ai_prompt_versions (document_type_id, center_id, is_published, version DESC);

DROP TRIGGER IF EXISTS update_ai_document_types_updated_at ON public.ai_document_types;
CREATE TRIGGER update_ai_document_types_updated_at
  BEFORE UPDATE ON public.ai_document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prevent_published_prompt_version_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_published = true THEN
    IF NEW.user_prompt IS DISTINCT FROM OLD.user_prompt
      OR NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.temperature IS DISTINCT FROM OLD.temperature
      OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
      OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
      OR NEW.document_type_id IS DISTINCT FROM OLD.document_type_id
      OR NEW.version IS DISTINCT FROM OLD.version
    THEN
      RAISE EXCEPTION 'No se puede modificar una versión de prompt ya publicada. Crea una nueva versión en su lugar.';
    END IF;

    IF NEW.is_published = false THEN
      RAISE EXCEPTION 'No se puede despublicar una versión de prompt. Publica otra versión para reemplazarla.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_published_prompt_version_modification_trigger ON public.ai_prompt_versions;
CREATE TRIGGER prevent_published_prompt_version_modification_trigger
  BEFORE UPDATE ON public.ai_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_published_prompt_version_modification();

ALTER TABLE public.ai_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View document types (system or own center)"
  ON public.ai_document_types
  FOR SELECT
  USING (center_id IS NULL OR center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins manage document types in their center"
  ON public.ai_document_types
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "View prompt versions in center"
  ON public.ai_prompt_versions
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Create prompt versions in center"
  ON public.ai_prompt_versions
  FOR INSERT
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR professional_id = auth.uid())
  );

CREATE POLICY "Update own unpublished prompt versions"
  ON public.ai_prompt_versions
  FOR UPDATE
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR professional_id = auth.uid())
    AND is_published = false
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR professional_id = auth.uid())
  );

CREATE POLICY "Admins delete unpublished prompt versions"
  ON public.ai_prompt_versions
  FOR DELETE
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
    AND is_published = false
  );

CREATE POLICY "View generated documents in center"
  ON public.ai_generated_documents
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Insert generated documents in center"
  ON public.ai_generated_documents
  FOR INSERT
  WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Update generated documents in center"
  ON public.ai_generated_documents
  FOR UPDATE
  USING (center_id = public.get_user_center_id(auth.uid()))
  WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins delete generated documents in center"
  ON public.ai_generated_documents
  FOR DELETE
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  );

INSERT INTO public.ai_document_types
  (center_id, key, label, description, audience, scope, requires, sections, mirror_column, default_user_prompt, sort_order)
VALUES
  (
    NULL, 'base_extraction', 'Extracción clínica base',
    'Extracción interna, estructurada, de los contenidos de la sesión. Sirve de base a otras plantillas.',
    'internal', 'session', '{}',
    '[
      {"key": "themes", "label": "Temas y focos", "required": true, "shareable": false},
      {"key": "situations", "label": "Situaciones relatadas", "required": true, "shareable": false},
      {"key": "emotions", "label": "Emociones y estados internos", "required": true, "shareable": false},
      {"key": "patterns", "label": "Patrones cognitivos y conductuales", "required": true, "shareable": false},
      {"key": "interventions", "label": "Intervenciones del terapeuta", "required": true, "shareable": false},
      {"key": "insights", "label": "Insights y puntos de inflexión", "required": true, "shareable": false},
      {"key": "agreements", "label": "Acuerdos y tareas", "required": true, "shareable": false},
      {"key": "ambiguities", "label": "Dudas o ambigüedades", "required": false, "shareable": false}
    ]'::jsonb,
    NULL,
    $prompt$Realiza la CAPA 1 — Extracción clínica base.

Analiza la transcripción y extrae de forma estructurada:
1. TEMAS Y FOCOS PRINCIPALES: Los motivos o focos principales trabajados en la sesión.
2. SITUACIONES RELATADAS: Situaciones concretas relatadas por el paciente.
3. EMOCIONES Y ESTADOS INTERNOS: Emociones, estados internos y reacciones relevantes detectadas.
4. PATRONES COGNITIVOS Y CONDUCTUALES: Cogniciones, creencias, conflictos, patrones relacionales o conductuales.
5. INTERVENCIONES DEL TERAPEUTA: Preguntas relevantes, reformulaciones, señalamientos, psicoeducación, confrontaciones suaves, validación, propuestas de tarea.
6. INSIGHTS Y PUNTOS DE INFLEXIÓN: Momentos clave de comprensión o cambio.
7. ACUERDOS Y TAREAS: Acuerdos explícitos, tareas o elementos a seguir explorando.
8. DUDAS O AMBIGÜEDADES: Aspectos que no quedan claros o que requieren más exploración.
9. DIFERENCIACIÓN: Distingue claramente entre hechos observados/expresados e interpretaciones/hipótesis clínicas.

Formato: texto estructurado con los apartados numerados, redactado de forma clara y concisa.$prompt$,
    10
  ),
  (
    NULL, 'clinical_report', 'Informe clínico de sesión',
    'Informe técnico de la sesión dirigido al profesional. Espeja en sessions.ai_summary_clinical.',
    'professional', 'session', '{base_extraction}',
    '[
      {"key": "quick_summary", "label": "Resumen rápido", "required": true, "shareable": true},
      {"key": "extended", "label": "Resumen clínico extendido", "required": true, "shareable": false},
      {"key": "interventions", "label": "Intervenciones terapéuticas relevantes", "required": true, "shareable": false},
      {"key": "next_steps", "label": "Siguientes pasos", "required": true, "shareable": false},
      {"key": "proposal", "label": "Propuesta de intervención", "required": false, "shareable": false}
    ]'::jsonb,
    'ai_summary_clinical',
    $prompt$Usando la base clínica extraída, genera el INFORME CLÍNICO PARA PROFESIONALES.

Criterios de estilo:
- Lenguaje técnico, claro y profesional
- Buena capacidad de conceptualización
- Distinguir observación de hipótesis
- Incluir intervenciones terapéuticas
- Señalar líneas de exploración y planificación
- No redactar como una simple transcripción

FORMATO:

1. RESUMEN RÁPIDO
Síntesis breve de 5 a 8 líneas con el foco principal de la sesión, los temas trabajados y el sentido clínico general.

2. RESUMEN CLÍNICO EXTENDIDO
Texto estructurado por bloques temáticos. En cada bloque, integra de forma natural:
- Situación o contenido relatado por el paciente
- Emociones o respuestas observadas
- Patrones cognitivos, conductuales o relacionales implicados
- Intervenciones del terapeuta
- Hipótesis o formulaciones clínicas tentativas
- Conceptos psicológicos explicados en sesión, si los hubo
No lo conviertas en una lista telegráfica. Debe leerse como una síntesis clínica ordenada y útil.

3. INTERVENCIONES TERAPÉUTICAS RELEVANTES
Describe de forma breve y técnica qué hizo el TERAPEUTA durante la sesión y con qué finalidad aparente. Distingue entre exploración, validación, psicoeducación, reformulación, confrontación, clarificación, focalización, trabajo emocional o planificación.

4. SIGUIENTES PASOS
Divide en dos subapartados:
a) Para el PACIENTE: Tareas, observaciones, ejercicios, autorregistros, focos de reflexión o conductas a observar entre sesiones.
b) Para el TERAPEUTA: Aspectos a seguir explorando, hipótesis a contrastar, focos de intervención y objetivos clínicos inmediatos.

5. PROPUESTA DE INTERVENCIÓN
Propón líneas de trabajo para próximas sesiones basadas únicamente en el contenido de esta sesión. Puedes incluir objetivos, técnicas o estrategias compatibles con el material trabajado. No propongas intervenciones desconectadas de la transcripción.$prompt$,
    20
  ),
  (
    NULL, 'patient_report', 'Resumen para el paciente',
    'Resumen de la sesión en lenguaje accesible, pensado para compartir con el paciente. Espeja en sessions.ai_summary_patient.',
    'patient', 'session', '{base_extraction}',
    '[
      {"key": "key_points", "label": "Lo más importante de la sesión", "required": true, "shareable": true},
      {"key": "worked_on", "label": "Lo que trabajamos hoy", "required": true, "shareable": true},
      {"key": "takeaways", "label": "Ideas importantes para quedarte", "required": true, "shareable": true},
      {"key": "weekly_proposals", "label": "Propuestas para esta semana", "required": true, "shareable": true},
      {"key": "closing", "label": "Cierre de la sesión", "required": false, "shareable": true}
    ]'::jsonb,
    'ai_summary_patient',
    $prompt$Usando la base clínica extraída, genera el INFORME DE SESIÓN PARA EL PACIENTE.

Criterios de estilo:
- Lenguaje claro, cercano, comprensible y respetuoso
- Explicar ideas psicológicas de forma sencilla
- Centrarse en lo trabajado, lo comprendido y lo que puede ayudar entre sesiones
- Evitar tecnicismos innecesarios
- Evitar tono excesivamente solemne o infantilizante
- No atribuyas aprendizajes profundos, cambios internos ni conclusiones transformadoras si no emergen con claridad en la sesión
- Prioriza una formulación honesta y ajustada: qué se habló, qué se observó y qué puede seguir explorándose
- No confundas contenido verbalizado por el paciente con formulación clínica del terapeuta

FORMATO:

1. LO MÁS IMPORTANTE DE LA SESIÓN
Síntesis breve y clara, en lenguaje accesible, de 4 a 6 líneas.

2. LO QUE TRABAJAMOS HOY
Explica con claridad los temas tratados durante la sesión, organizados por apartados con títulos útiles y naturales. Incluye:
- Situaciones comentadas
- Cómo te sentiste o qué te fue pasando
- Ideas o patrones que aparecieron
- Nuevas formas de entender lo que está ocurriendo
Si aparece algún concepto psicológico, explícalo de forma sencilla y aplicada a lo hablado en sesión.

3. IDEAS IMPORTANTES PARA QUEDARTE
Resume en 3 a 6 ideas claras los aprendizajes, observaciones o reflexiones más valiosas de la sesión. Deben ser concretas, no frases genéricas.

4. PROPUESTAS PARA ESTA SEMANA
Indica acciones, ejercicios, observaciones o pequeñas tareas que puedan ser útiles hasta la próxima sesión. Escríbelas de forma clara, realista y aplicable.

5. CIERRE DE LA SESIÓN
Escribe un cierre breve, humano y respetuoso, que recoja el sentido del trabajo realizado y ayude al paciente a continuar el proceso.$prompt$,
    30
  ),
  (
    NULL, 'soap_note', 'Nota SOAP',
    'Nota clínica en formato SOAP (Subjetivo, Objetivo, Valoración, Plan).',
    'professional', 'session', '{}',
    '[
      {"key": "subjective", "label": "Subjetivo", "required": true, "shareable": false},
      {"key": "objective", "label": "Objetivo", "required": true, "shareable": false},
      {"key": "assessment", "label": "Valoración", "required": true, "shareable": false},
      {"key": "plan", "label": "Plan", "required": true, "shareable": false}
    ]'::jsonb,
    NULL,
    $prompt$Genera una NOTA SOAP a partir de la transcripción de la sesión.

Usa exclusivamente información que aparezca de forma explícita o pueda inferirse con prudencia de la transcripción. No completes datos ausentes ni asumas antecedentes, diagnósticos o evolución que no consten en este encuentro. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

FORMATO (una clave por apartado, redacción breve y técnica):

1. SUBJETIVO (subjective)
Lo relatado por el PACIENTE en sus propias palabras o parafraseado con fidelidad: motivo de consulta de la sesión, malestar referido, situación actual descrita, quejas o preocupaciones expresadas.

2. OBJETIVO (objective)
Observaciones directas del TERAPEUTA durante la sesión: presentación, estado de ánimo aparente, actitud, discurso, elementos observables. No incluyas interpretaciones, solo aquello que puede describirse como observado.

3. VALORACIÓN (assessment)
Valoración clínica de lo trabajado: relación entre lo relatado y lo observado, hipótesis clínicas tentativas si las hay, evolución respecto a focos previos si se mencionan explícitamente. Distingue siempre hecho de hipótesis.

4. PLAN (plan)
Plan de actuación derivado de esta sesión: próximos pasos terapéuticos, tareas o pruebas propuestas, aspectos a seguir explorando. No propongas intervenciones desconectadas del contenido de la sesión.$prompt$,
    40
  ),
  (
    NULL, 'first_consultation', 'Anamnesis de primera consulta',
    'Anamnesis estructurada para la primera sesión con un paciente.',
    'professional', 'session', '{}',
    '[
      {"key": "reason", "label": "Motivo de consulta", "required": true, "shareable": false},
      {"key": "history", "label": "Historia y antecedentes", "required": true, "shareable": false},
      {"key": "current_status", "label": "Situación actual", "required": true, "shareable": false},
      {"key": "observations", "label": "Observaciones", "required": true, "shareable": false},
      {"key": "hypotheses", "label": "Hipótesis diagnósticas iniciales", "required": false, "shareable": false},
      {"key": "plan", "label": "Plan de trabajo propuesto", "required": true, "shareable": false}
    ]'::jsonb,
    NULL,
    $prompt$Genera la ANAMNESIS DE PRIMERA CONSULTA a partir de la transcripción de esta sesión inicial.

Usa únicamente lo que el PACIENTE ha expresado o el TERAPEUTA ha observado en esta sesión. No completes historia clínica, antecedentes ni diagnósticos que no se hayan mencionado explícitamente. Si un dato relevante no aparece, indícalo como ausente en lugar de inventarlo. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

FORMATO:

1. MOTIVO DE CONSULTA (reason)
Razón por la que el paciente acude, tal como la expresa, y el problema o malestar principal referido.

2. HISTORIA Y ANTECEDENTES (history)
Antecedentes personales, familiares, médicos o de tratamientos previos que el paciente haya mencionado explícitamente en la sesión.

3. SITUACIÓN ACTUAL (current_status)
Circunstancias vitales, relacionales, laborales o de salud actuales relevantes para el motivo de consulta, según lo relatado.

4. OBSERVACIONES (observations)
Observaciones directas del TERAPEUTA durante la entrevista: actitud, discurso, estado emocional aparente, forma de relatar.

5. HIPÓTESIS DIAGNÓSTICAS INICIALES (hypotheses)
Si el contenido de la sesión lo permite, formula hipótesis clínicas tentativas y prudentes, dejando claro que son provisionales y sujetas a confirmación en próximas sesiones. Si no hay base suficiente, indícalo así en lugar de forzar una hipótesis.

6. PLAN DE TRABAJO PROPUESTO (plan)
Propuesta de encuadre y próximos pasos terapéuticos basados en lo recogido en esta primera consulta.$prompt$,
    50
  ),
  (
    NULL, 'homework_plan', 'Propuesta de tareas y autorregistros',
    'Propuesta de tareas y autorregistros para el paciente entre sesiones.',
    'patient', 'session', '{}',
    '[
      {"key": "tasks", "label": "Tareas propuestas", "required": true, "shareable": true},
      {"key": "self_monitoring", "label": "Autorregistros sugeridos", "required": true, "shareable": true},
      {"key": "notes", "label": "Notas para la semana", "required": false, "shareable": true}
    ]'::jsonb,
    NULL,
    $prompt$Genera una PROPUESTA DE TAREAS Y AUTORREGISTROS para el paciente, dirigida a él directamente, a partir de lo trabajado en esta sesión.

Usa un lenguaje claro y respetuoso, sin tecnicismos innecesarios, pero evita frases de autoayuda genéricas o vacías. Propón únicamente tareas conectadas con el contenido real de la sesión; no añadas ejercicios estándar desconectados de lo hablado. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

FORMATO:

1. TAREAS PROPUESTAS (tasks)
Acciones concretas y realistas para practicar o poner en marcha antes de la próxima sesión, derivadas de lo trabajado hoy.

2. AUTORREGISTROS SUGERIDOS (self_monitoring)
Qué observar o anotar entre sesiones (situaciones, pensamientos, emociones, conductas) y con qué finalidad, si la sesión ofrece base para proponerlo.

3. NOTAS PARA LA SEMANA (notes)
Aclaraciones, recordatorios o matices adicionales útiles para llevar a cabo lo anterior, solo si aportan algo relevante; si no procede, esta sección puede quedar breve.$prompt$,
    60
  ),
  (
    NULL, 'evolution_report', 'Informe de evolución',
    'Informe de evolución del proceso terapéutico a lo largo de varias sesiones.',
    'professional', 'multi_session', '{}',
    '[
      {"key": "period", "label": "Periodo cubierto", "required": true, "shareable": false},
      {"key": "evolution", "label": "Evolución observada", "required": true, "shareable": false},
      {"key": "recurring_themes", "label": "Temas recurrentes", "required": true, "shareable": false},
      {"key": "progress", "label": "Avances y obstáculos", "required": true, "shareable": false},
      {"key": "recommendations", "label": "Recomendaciones", "required": false, "shareable": false}
    ]'::jsonb,
    NULL,
    $prompt$Genera un INFORME DE EVOLUCIÓN a partir de las sesiones incluidas en este periodo.

Basa el informe exclusivamente en el contenido disponible de las sesiones proporcionadas. No proyectes una evolución continua si los datos son insuficientes o discontinuos; en ese caso, indícalo explícitamente. Distingue siempre entre cambios observados y valoraciones o hipótesis del terapeuta. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

FORMATO:

1. PERIODO CUBIERTO (period)
Indica qué sesiones o qué rango temporal recoge este informe, según la información disponible.

2. EVOLUCIÓN OBSERVADA (evolution)
Cambios, estabilidad o retrocesos observables a lo largo de las sesiones respecto al motivo de consulta y los focos trabajados.

3. TEMAS RECURRENTES (recurring_themes)
Asuntos, situaciones o patrones que reaparecen de forma consistente a lo largo del periodo.

4. AVANCES Y OBSTÁCULOS (progress)
Logros o mejoras identificables y dificultades o resistencias que hayan aparecido en el proceso.

5. RECOMENDACIONES (recommendations)
Si el contenido lo permite, orientaciones prudentes sobre el rumbo del proceso terapéutico; si no hay base suficiente, esta sección puede quedar breve o sin recomendaciones concretas.$prompt$,
    70
  ),
  (
    NULL, 'discharge_report', 'Informe de alta',
    'Informe de cierre del proceso terapéutico al alta del paciente.',
    'professional', 'multi_session', '{}',
    '[
      {"key": "process_summary", "label": "Resumen del proceso", "required": true, "shareable": false},
      {"key": "objectives_achieved", "label": "Objetivos alcanzados", "required": true, "shareable": false},
      {"key": "final_status", "label": "Situación al alta", "required": true, "shareable": false},
      {"key": "recommendations", "label": "Recomendaciones de mantenimiento", "required": true, "shareable": false}
    ]'::jsonb,
    NULL,
    $prompt$Genera un INFORME DE ALTA a partir de las sesiones del proceso terapéutico proporcionadas.

Redacta con rigor clínico y prudencia: recoge únicamente lo que puede sustentarse en el contenido de las sesiones incluidas. No des por alcanzados objetivos que no consten explícitamente como trabajados o logrados. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

FORMATO:

1. RESUMEN DEL PROCESO (process_summary)
Síntesis del recorrido terapéutico: motivo de consulta inicial, focos principales trabajados y duración aproximada del proceso según los datos disponibles.

2. OBJETIVOS ALCANZADOS (objectives_achieved)
Objetivos terapéuticos que, según el contenido de las sesiones, se consideran razonablemente alcanzados o trabajados de forma sustancial.

3. SITUACIÓN AL ALTA (final_status)
Estado del paciente en el momento del alta según lo observado y relatado en las últimas sesiones disponibles.

4. RECOMENDACIONES DE MANTENIMIENTO (recommendations)
Pautas prudentes para sostener lo trabajado tras el alta, basadas en los focos y patrones identificados durante el proceso, evitando indicaciones genéricas no conectadas con el caso.$prompt$,
    80
  )
ON CONFLICT (coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_ai_prompt_versions_for_center(p_center_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ai_prompt_system text;
  v_ai_prompt_layer1 text;
  v_ai_prompt_layer2 text;
  v_ai_prompt_layer3 text;
BEGIN
  SELECT c.ai_prompt_system, c.ai_prompt_layer1, c.ai_prompt_layer2, c.ai_prompt_layer3
  INTO v_ai_prompt_system, v_ai_prompt_layer1, v_ai_prompt_layer2, v_ai_prompt_layer3
  FROM public.centers c
  WHERE c.id = p_center_id;

  INSERT INTO public.ai_prompt_versions
    (document_type_id, center_id, version, system_prompt, user_prompt, professional_id, session_type_id, is_published)
  SELECT
    dt.id,
    p_center_id,
    1,
    v_ai_prompt_system,
    CASE dt.key
      WHEN 'base_extraction' THEN coalesce(v_ai_prompt_layer1, dt.default_user_prompt)
      WHEN 'clinical_report' THEN coalesce(v_ai_prompt_layer2, dt.default_user_prompt)
      WHEN 'patient_report'  THEN coalesce(v_ai_prompt_layer3, dt.default_user_prompt)
      ELSE dt.default_user_prompt
    END,
    NULL,
    NULL,
    true
  FROM public.ai_document_types dt
  WHERE dt.center_id IS NULL
    AND dt.is_active = true
    AND dt.default_user_prompt IS NOT NULL
  ON CONFLICT (document_type_id, center_id, version) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_ai_prompt_versions_for_new_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_ai_prompt_versions_for_center(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudieron sembrar las versiones de prompt para el centro % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_ai_prompt_versions_after_center_insert ON public.centers;
CREATE TRIGGER seed_ai_prompt_versions_after_center_insert
  AFTER INSERT ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_ai_prompt_versions_for_new_center();

DO $backfill$
DECLARE
  v_center record;
  v_clinical_report_id uuid;
  v_patient_report_id  uuid;
BEGIN
  FOR v_center IN SELECT id FROM public.centers LOOP
    PERFORM public.seed_ai_prompt_versions_for_center(v_center.id);
  END LOOP;

  SELECT id INTO v_clinical_report_id FROM public.ai_document_types WHERE center_id IS NULL AND key = 'clinical_report';
  SELECT id INTO v_patient_report_id  FROM public.ai_document_types WHERE center_id IS NULL AND key = 'patient_report';

  INSERT INTO public.ai_generated_documents
    (center_id, session_id, patient_id, document_type_id, prompt_version_id,
     source_session_ids, content_sections, content_markdown, generated_at)
  SELECT
    s.center_id, s.id, s.patient_id, v_clinical_report_id, NULL,
    ARRAY[s.id], jsonb_build_object('legacy', s.ai_summary_clinical), s.ai_summary_clinical,
    coalesce(s.transcript_processed_at, s.updated_at)
  FROM public.sessions s
  WHERE s.ai_summary_clinical IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_generated_documents d
      WHERE d.session_id = s.id
        AND d.document_type_id = v_clinical_report_id
        AND d.prompt_version_id IS NULL
    );

  INSERT INTO public.ai_generated_documents
    (center_id, session_id, patient_id, document_type_id, prompt_version_id,
     source_session_ids, content_sections, content_markdown, generated_at)
  SELECT
    s.center_id, s.id, s.patient_id, v_patient_report_id, NULL,
    ARRAY[s.id], jsonb_build_object('legacy', s.ai_summary_patient), s.ai_summary_patient,
    coalesce(s.transcript_processed_at, s.updated_at)
  FROM public.sessions s
  WHERE s.ai_summary_patient IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_generated_documents d
      WHERE d.session_id = s.id
        AND d.document_type_id = v_patient_report_id
        AND d.prompt_version_id IS NULL
    );
END;
$backfill$ LANGUAGE plpgsql;
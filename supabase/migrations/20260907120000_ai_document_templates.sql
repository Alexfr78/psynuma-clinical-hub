-- =====================================================================
-- Catálogo de plantillas de documentos clínicos generados por IA
-- =====================================================================
-- Sustituye el sistema de "3 capas" fijas (centers.ai_prompt_layer1/2/3)
-- por un catálogo de plantillas de documento versionadas, con salida en
-- secciones tipadas y ámbito por centro / profesional / tipo de sesión.
--
-- Esta migración:
--   1. Crea las tablas ai_document_types, ai_prompt_versions y
--      ai_generated_documents (con default_user_prompt en el catálogo:
--      el prompt semilla de cada plantilla vive en la propia fila, no
--      repartido entre código y backfill).
--   2. Crea los índices necesarios (incluido el índice funcional que
--      tolera center_id NULL en el catálogo de plantillas).
--   3. Reutiliza el trigger de updated_at ya existente en el repo.
--   4. Habilita RLS con el mismo patrón que consent_templates.
--   5. Añade el trigger de inmutabilidad de versiones publicadas.
--   6. Siembra las 8 plantillas de sistema (center_id = NULL), cada una
--      con su default_user_prompt.
--   7. Crea una función compartida que siembra la versión 1 publicada de
--      cada plantilla activa para UN centro, y un trigger AFTER INSERT en
--      centers que la invoca automáticamente para centros nuevos.
--   8. Hace backfill, reutilizando esa misma función, de una versión 1
--      publicada por cada centro YA existente, y de ai_generated_documents
--      "legacy" a partir de sessions.ai_summary_clinical / ai_summary_patient.
--
-- NO se eliminan ni modifican columnas de centers ni de sessions.
-- sessions.ai_summary_clinical / ai_summary_patient se siguen
-- escribiendo como espejo; esta migración no cambia ese comportamiento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_document_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     uuid REFERENCES public.centers(id) ON DELETE CASCADE,   -- NULL = plantilla de sistema
  key           text NOT NULL,
  label         text NOT NULL,
  description   text,
  audience      text NOT NULL,                       -- 'professional' | 'patient' | 'internal' | 'third_party'
  scope         text NOT NULL DEFAULT 'session',      -- 'session' | 'multi_session' | 'patient'
  requires      text[] NOT NULL DEFAULT '{}',         -- keys de otros document types (p.ej. '{base_extraction}')
  sections      jsonb NOT NULL DEFAULT '[]',          -- [{ key, label, required, shareable }, ...]
  input_schema  jsonb NOT NULL DEFAULT '{}',          -- campos a pedir antes de generar (grupo C, aún sin UI)
  required_consent_purposes text[] NOT NULL DEFAULT '{ai_processing,report_generation}',
  mirror_column text,                                 -- 'ai_summary_clinical' | 'ai_summary_patient' | NULL
  -- Prompt de usuario por defecto de la plantilla. Es la fuente única del texto semilla:
  -- lo usa tanto el backfill por centro como el trigger de siembra para centros nuevos
  -- (ver más abajo), y también sirve de red de seguridad en la edge function cuando un
  -- centro no tiene ninguna versión publicada (§4 regla 4 del contrato). NULL solo tendría
  -- sentido en una plantilla de centro creada a mano sin prompt por defecto; las 8
  -- plantillas de sistema sembradas por esta migración siempre lo rellenan.
  default_user_prompt text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Unicidad de (center_id, key) que tolera center_id NULL.
-- Un `unique (center_id, key)` normal NO sirve: en Postgres dos NULL no se
-- consideran iguales entre sí, así que una tabla con varias plantillas de
-- sistema (todas con center_id NULL) podría acabar con keys repetidas sin
-- que la constraint lo impidiera. Sustituimos el NULL por un uuid fijo
-- (el "centro cero") solo a efectos de la comparación de unicidad.
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
  professional_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,   -- NULL = comodín
  session_type_id  uuid REFERENCES public.session_types(id) ON DELETE CASCADE, -- NULL = comodín
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
  -- ON DELETE SET NULL, no la acción por defecto (NO ACTION): ai_prompt_versions
  -- se borra en cascada cuando se borra el profesional o el tipo de sesión al que
  -- está atada, y sin este SET NULL esa cascada chocaría contra los documentos que
  -- la referencian, dejando imposible borrar un profesional. La columna ya es
  -- nullable por diseño (las filas del backfill legacy no tienen versión), así que
  -- perder el sello es degradación aceptable frente a bloquear el borrado.
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

-- ---------------------------------------------------------------------
-- 2. ÍNDICES
-- ---------------------------------------------------------------------

-- Resolución de dependencias (§6.4 del contrato): para una sesión dada,
-- comprobar si ya existe un documento generado de un document_type concreto
-- (p.ej. ¿ya existe el 'base_extraction' de esta sesión?).
CREATE INDEX IF NOT EXISTS ai_generated_documents_session_type_idx
  ON public.ai_generated_documents (session_id, document_type_id);

-- Historial de documentos de un paciente en orden cronológico: lo usan los
-- documentos de ámbito 'multi_session' (evolution_report, discharge_report)
-- y las vistas de paciente en general.
CREATE INDEX IF NOT EXISTS ai_generated_documents_patient_generated_at_idx
  ON public.ai_generated_documents (patient_id, generated_at DESC);

-- Precedencia de resolución de prompt (§4 del contrato): dado un
-- document_type y un centro, se busca la versión publicada más reciente
-- que case con professional_id/session_type_id, en orden de prioridad
-- (session_type concreto > professional concreto > comodín de centro).
-- Este índice cubre el filtro común a los cuatro niveles y permite además
-- ordenar por version DESC sin un sort adicional.
CREATE INDEX IF NOT EXISTS ai_prompt_versions_precedence_idx
  ON public.ai_prompt_versions (document_type_id, center_id, is_published, version DESC);

-- ---------------------------------------------------------------------
-- 3. updated_at AUTOMÁTICO
-- ---------------------------------------------------------------------
-- Reutilizamos la función existente public.update_updated_at_column()
-- (definida en 20251210114820_aa013973-...sql y usada por decenas de
-- tablas del repo) en vez de crear una nueva.

DROP TRIGGER IF EXISTS update_ai_document_types_updated_at ON public.ai_document_types;
CREATE TRIGGER update_ai_document_types_updated_at
  BEFORE UPDATE ON public.ai_document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ai_prompt_versions y ai_generated_documents no tienen updated_at en el
-- contrato (son versionadas/append-only), así que no llevan este trigger.

-- ---------------------------------------------------------------------
-- 4. TRIGGER DE INMUTABILIDAD DE VERSIONES PUBLICADAS
-- ---------------------------------------------------------------------
-- Una vez is_published = true, el contenido de la versión (user_prompt,
-- system_prompt, model, temperature) no puede volver a modificarse. Para
-- publicar una versión (is_published false -> true) SÍ está permitido.
-- La comprobación se hace en BEFORE UPDATE mirando el estado ANTERIOR de
-- la fila (OLD.is_published): si ya estaba publicada, ningún cambio de
-- contenido se admite, independientemente de qué valor tome NEW.is_published.

CREATE OR REPLACE FUNCTION public.prevent_published_prompt_version_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_published = true THEN
    -- El ámbito (professional_id / session_type_id) es tan inmutable como el texto:
    -- reapuntarlo cambiaría retroactivamente el significado de los documentos ya
    -- sellados con esta versión, que es justo lo que el versionado viene a evitar.
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

    -- Despublicar tampoco: una versión publicada puede haber sellado documentos.
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

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Patrón de referencia: consent_templates
-- (supabase/migrations/20251214104054_82c50357-...sql, líneas 70-80),
-- usando las funciones helper reales del repo:
--   get_user_center_id(_user_id uuid) RETURNS uuid  -- profiles.center_id
--   is_admin(_user_id uuid) RETURNS boolean
--   is_professional(_user_id uuid) RETURNS boolean
-- (definidas/reescritas en 20251210114820_... y 20251225120849_...).

ALTER TABLE public.ai_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;

-- ai_document_types --------------------------------------------------
-- SELECT: cualquier usuario ve las plantillas de sistema (center_id NULL)
-- y las propias de su centro.
CREATE POLICY "View document types (system or own center)"
  ON public.ai_document_types
  FOR SELECT
  USING (center_id IS NULL OR center_id = public.get_user_center_id(auth.uid()));

-- INSERT/UPDATE/DELETE: solo el admin del centro, y solo sobre plantillas
-- de su propio centro. Al comparar center_id = get_user_center_id(...),
-- las filas de sistema (center_id IS NULL) quedan automáticamente
-- excluidas: NULL = uuid nunca es TRUE en Postgres, así que nadie puede
-- escribir plantillas de sistema desde el cliente.
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

-- ai_prompt_versions ---------------------------------------------------
CREATE POLICY "View prompt versions in center"
  ON public.ai_prompt_versions
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

-- Un profesional solo puede crear versiones atadas a sí mismo; el admin
-- puede crear cualquiera (incluidas las de comodín de centro).
CREATE POLICY "Create prompt versions in center"
  ON public.ai_prompt_versions
  FOR INSERT
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR professional_id = auth.uid())
  );

-- UPDATE: la fila debe pertenecer al centro del usuario, el usuario debe
-- ser admin o dueño de la versión (professional_id = auth.uid()), y la
-- fila NO debe estar ya publicada (is_published = false se evalúa sobre
-- el estado ANTERIOR, vía USING). El WITH CHECK deliberadamente NO repite
-- "is_published = false": así se permite la transición false -> true
-- (publicar) sin permitir tocar el contenido de una fila ya publicada
-- (eso lo bloquea, en última instancia, el trigger de inmutabilidad).
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

-- DELETE: solo admin del centro y solo si la versión no está publicada.
CREATE POLICY "Admins delete unpublished prompt versions"
  ON public.ai_prompt_versions
  FOR DELETE
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
    AND is_published = false
  );

-- ai_generated_documents -------------------------------------------------
CREATE POLICY "View generated documents in center"
  ON public.ai_generated_documents
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

-- INSERT/UPDATE desde el cliente: la edge function usa service role (que
-- salta RLS), así que estas políticas solo cubren la edición manual de
-- secciones desde la app. El contrato no exige distinguir admin/profesional
-- aquí, solo que el documento pertenezca al centro del usuario.
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

-- ---------------------------------------------------------------------
-- 6. SEED: catálogo de plantillas de sistema (center_id = NULL)
-- ---------------------------------------------------------------------
-- El ON CONFLICT usa las mismas expresiones que el índice funcional
-- ai_document_types_center_key_uidx, para que la siembra sea idempotente.
--
-- default_user_prompt: para base_extraction / clinical_report /
-- patient_report son los mismos textos que antes vivían en
-- src/lib/defaultPrompts.ts (DEFAULT_LAYER1/2/3_PROMPT). Para las 5
-- plantillas nuevas son prompts redactados para esta migración, en el
-- mismo registro clínico y sobrio que los anteriores. Esta columna es
-- ahora la ÚNICA fuente del texto semilla: la usa el backfill de abajo,
-- el trigger que siembra centros nuevos, y la edge function como último
-- recurso si un centro se queda sin ninguna versión publicada.
--
-- Se usan delimitadores de dólar con etiqueta ($prompt$) para los textos
-- largos en español, que contienen numerosas comillas simples (apóstrofos
-- y abreviaturas) que romperían el escapado clásico con ''.

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

-- ---------------------------------------------------------------------
-- 7. FUNCIÓN COMPARTIDA + TRIGGER: siembra de versiones para UN centro
-- ---------------------------------------------------------------------
-- Un centro creado DESPUÉS de esta migración no pasaría nunca por el
-- backfill de la sección 8, y se quedaría sin ninguna fila en
-- ai_prompt_versions: la precedencia del §4 del contrato no tendría nada
-- que resolver y la generación de documentos fallaría para ese centro.
--
-- Para evitarlo, la lógica de "sembrar la versión 1 publicada de cada
-- plantilla activa para un centro" se extrae a una función SQL reutilizable,
-- que se invoca:
--   a) desde un trigger AFTER INSERT en centers, para cada centro nuevo, y
--   b) desde el backfill de la sección 8, para cada centro ya existente.
--
-- SECURITY DEFINER es imprescindible: el centro se crea normalmente desde
-- CenterSetupWizard por un usuario que todavía no tiene ninguna fila propia
-- en ai_prompt_versions (ni falta que le hace: la política de INSERT de esa
-- tabla exige is_admin() o professional_id = auth.uid(), y aquí no hay
-- ninguna versión "de alguien" que crear, es la siembra automática del
-- sistema). Sin SECURITY DEFINER, RLS bloquearía esta inserción.
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

  -- Una fila (version 1, publicada, comodín de profesional/tipo de sesión) por cada
  -- plantilla de sistema activa. Para base_extraction / clinical_report / patient_report
  -- se respeta la personalización histórica del centro (centers.ai_prompt_layerN) si
  -- existe; si no, o para cualquier otra plantilla, se usa el default_user_prompt de la
  -- propia plantilla. system_prompt = centers.ai_prompt_system (puede ser NULL).
  -- ON CONFLICT hace la función idempotente: puede volver a llamarse sin duplicar filas.
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
  -- La siembra NUNCA debe impedir crear un centro. Un centro se crea en el primer
  -- login, desde CenterSetupWizard: si esta siembra fallara (una plantilla de sistema
  -- con default_user_prompt NULL, por ejemplo), un error aquí abortaría el alta entera
  -- y dejaría al usuario sin poder entrar en la aplicación. La generación de documentos
  -- ya tiene su propia red: la edge function cae en ai_document_types.default_user_prompt
  -- cuando el centro no tiene versiones. Así que registramos el fallo y seguimos.
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

-- ---------------------------------------------------------------------
-- 8. BACKFILL: versión 1 publicada por centro YA existente, para cada
--    plantilla, reutilizando la función de la sección 7. Y backfill de
--    ai_generated_documents "legacy" a partir de sessions.
-- ---------------------------------------------------------------------

DO $backfill$
DECLARE
  v_center record;
  v_clinical_report_id uuid;
  v_patient_report_id  uuid;
BEGIN
  -- 8.a. Una versión 1 publicada de cada plantilla activa, para cada centro
  -- que ya existía antes de aplicar esta migración. El trigger de la
  -- sección 7 se encarga de los centros que se creen a partir de ahora.
  FOR v_center IN SELECT id FROM public.centers LOOP
    PERFORM public.seed_ai_prompt_versions_for_center(v_center.id);
  END LOOP;

  -- -------------------------------------------------------------------
  -- 8.b. BACKFILL de ai_generated_documents desde sessions (filas legacy)
  -- -------------------------------------------------------------------
  -- Una fila por cada columna espejo no nula. prompt_version_id queda NULL
  -- (no sabemos con qué versión de prompt se generó originalmente el
  -- texto, ya que antes de esta migración no existía versionado).
  -- El guard "NOT EXISTS" hace el backfill idempotente ante una posible
  -- re-ejecución de esta migración.

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

-- NO se eliminan centers.ai_prompt_layer1/2/3, ai_prompt_system ni
-- ai_analysis_mode en esta migración. Se retiran en una fase posterior,
-- cuando el nuevo sistema de plantillas esté verificado en producción.

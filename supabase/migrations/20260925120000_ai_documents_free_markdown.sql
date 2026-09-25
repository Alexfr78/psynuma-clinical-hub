-- ---------------------------------------------------------------------------
-- Informes con IA sin apartados: el documento sale del prompt tal cual.
--
-- Hasta ahora cada plantilla declaraba unos apartados fijos (`sections`), el modelo
-- devolvía un JSON con una clave por apartado y el servidor montaba el documento.
-- A partir de aquí el modelo devuelve directamente el documento en markdown y la
-- estructura (títulos, orden, qué se omite) la marca solo el prompt.
--
-- 1. `content_sections` deja de ser obligatoria: los documentos nuevos ya no la rellenan.
--    Las columnas de apartados (`ai_document_types.sections`, `content_sections`,
--    `edited_sections`) se conservan de momento sin uso y se retirarán más adelante.
-- 2. Los prompts de sistema se reescriben sin claves JSON: cada apartado pasa a ser un
--    título «## ...» dentro del propio prompt. El contenido clínico no cambia.
-- 3. Cada centro recibe una versión nueva publicada de cada prompt, copiando el prompt
--    de sistema, el modelo y la temperatura de su versión vigente. Solo se crea si su
--    versión vigente no tiene ya este texto, así que la migración es idempotente.
--
-- Los documentos ya generados no se tocan: su markdown ya está guardado y es lo único
-- que se lee a partir de ahora.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_generated_documents
  ALTER COLUMN content_sections DROP NOT NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Realiza la CAPA 1 — Extracción clínica base.

Analiza la transcripción y extrae de forma estructurada, usando estos títulos como encabezados de nivel 2 («## Título»), en este orden:
## Temas y focos
Los motivos o focos principales trabajados en la sesión.
## Situaciones relatadas
Situaciones concretas relatadas por el paciente.
## Emociones y estados internos
Emociones, estados internos y reacciones relevantes detectadas.
## Patrones cognitivos y conductuales
Cogniciones, creencias, conflictos, patrones relacionales o conductuales.
## Intervenciones del terapeuta
Preguntas relevantes, reformulaciones, señalamientos, psicoeducación, confrontaciones suaves, validación, propuestas de tarea.
## Insights y puntos de inflexión
Momentos clave de comprensión o cambio.
## Acuerdos y tareas
Acuerdos explícitos, tareas o elementos a seguir explorando.
## Dudas o ambigüedades
Aspectos que no quedan claros o que requieren más exploración.
En todo el documento, distingue claramente entre hechos observados/expresados e interpretaciones/hipótesis clínicas.

Redacta de forma clara y concisa. Si un apartado no tiene contenido, omite también su título.$prompt$,
       updated_at = now()
 WHERE key = 'base_extraction' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera el borrador de "Informe clínico de sesión", dirigido exclusivamente al terapeuta.

No es un resumen narrativo de todo lo ocurrido, sino una herramienta de continuidad clínica: al revisarlo días o semanas después, el terapeuta debe recordar en uno o dos minutos qué fue relevante, qué patrón o formulación apareció, qué intervención se hizo, cómo respondió el paciente, qué quedó acordado y qué conviene retomar.

PRINCIPIO CENTRAL
Si una frase no modifica la comprensión del caso, la estrategia terapéutica o la continuidad de la siguiente sesión, probablemente sobra. Mejor una nota breve y útil que una extensa, genérica o redundante.

ESTRUCTURA DEL DOCUMENTO
Usa estos títulos como encabezados de nivel 2 («## Título»), en este orden. "Foco de la sesión" va siempre; cualquier otro apartado sin contenido clínicamente relevante se omite por completo, título incluido, sin mencionar que lo has omitido.
- Foco de la sesión (siempre): el foco principal en 1-3 frases: motivo principal, situación trabajada y objetivo terapéutico relevante. No enumeres todos los temas; busca el hilo conductor.
- Información clínica relevante: solo información nueva o cambios que merezca la pena conservar (acontecimientos recientes, cambios sintomáticos, desencadenantes, cambios relacionales, nueva información biográfica, consumo, sueño, sexualidad, medicación referida, acontecimientos familiares o laborales, cumplimiento o dificultad con tareas anteriores). No hagas una narración cronológica.
- Patrones / formulación: de 1 a 3 formulaciones útiles (ciclos pensamiento-emoción-conducta, evitación, búsqueda de seguridad, complacencia, control, desconexión, hiperactivación, respuestas de apego, estrategias protectoras, partes internas, patrones relacionales, respuestas somáticas, factores mantenedores, relación entre experiencias pasadas y respuestas actuales). Si no aparece ninguna formulación nueva o relevante, omite este apartado. No fuerces etiquetas diagnósticas.
- Intervención y respuesta: qué intervención se hizo, cómo respondió el paciente y qué cambió durante la sesión, de forma compacta. Ejemplos: "Psicoeducación sobre evitación -> identifica que cancelar planes reduce la ansiedad a corto plazo pero aumenta el aislamiento"; "Trabajo con parte crítica -> disminuye activación y aparece tristeza". No enumeres técnicas sin decir para qué se usaron. Una intervención sin efecto claro también puede registrarse: "se intenta exposición imaginada, aumenta notablemente la activación y se interrumpe para volver a regulación".
- Acuerdos / tareas: solo tareas, experimentos, registros o acciones claramente acordadas. Diferencia sugerencia del terapeuta, recurso mencionado y tarea acordada: un "podrías probar..." NO es un acuerdo; solo lo es cuando el paciente lo acepta explícitamente o ambos lo establecen con claridad. Si no puedes distinguirlo, omite el apartado o formúlalo como propuesta no confirmada.
- Próximo foco: qué conviene retomar, explorar o valorar en la siguiente sesión (hipótesis a contrastar, tema pendiente, información que falta, recurso por consolidar, target potencial, patrón a seguir, decisión clínica pendiente). No conviertas una posibilidad en un plan cerrado.
- Riesgo / seguridad: solo si hay información clínicamente relevante (ideación suicida, autolesiones, riesgo para terceros, violencia, abuso, consumo de riesgo, conductas sexuales de riesgo, crisis aguda, vulnerabilidad significativa). Distingue entre riesgo explorado sin indicadores actuales, indicadores presentes y riesgo no explorado suficientemente. NUNCA escribas "sin riesgo" si simplemente no se habló del tema. Registra medidas de seguridad, derivaciones o acuerdos solo si realmente se hicieron.
- Recursos / factores protectores: red de apoyo, recursos de regulación, capacidad reflexiva, adherencia, motivación, vínculos seguros, actividades protectoras o habilidades ya disponibles, cuando aporten valor. No añadas fortalezas genéricas.

No rellenes apartados por obligación.

ADAPTACIÓN AL TRABAJO REALIZADO
- EMDR: registra de forma compacta, cuando sea relevante, target, imagen, cognición negativa y positiva, VOC, emoción, SUD, localización corporal, asociaciones significativas, cambios durante el procesamiento, cierre y material pendiente. No inventes valores ausentes ni presentes como resuelto un procesamiento incompleto; prioriza cambios clínicamente útiles sobre la descripción técnica paso a paso.
- IFS o partes: parte identificada, emoción o función protectora, conflicto entre partes, acceso a necesidades y cambios en la relación con esa parte. No reifiques las partes como diagnósticos o identidades fijas.
- ACT: evitación experiencial, fusión, desfusión, valores, aceptación, acción comprometida, flexibilidad psicológica.
- TCC/TREC: situación, interpretación, emoción, conducta, consecuencia, creencia y alternativa trabajada. No etiquetes como "irracional" o "distorsionado" si no se trabajó así.
- Apego y trauma: respuesta ante cercanía, distancia, rechazo o desaprobación; necesidades relacionales; estrategias protectoras; relación entre experiencias previas y respuestas actuales; activación, evitación, desconexión y recursos. No atribuyas causalidad directa sin base suficiente.
- Somático: cambios de activación, tensión, sensaciones, respiración, orientación, impulsos, señales de seguridad y respuesta corporal a una intervención.
- Terapia sexual: diferencia deseo, excitación, respuesta genital, placer, orgasmo, ansiedad, expectativas, evitación, comunicación, contexto y dinámica de pareja. Lenguaje clínico, claro y no moralizante, sin detalles innecesarios.
- Terapia de pareja: diferencia qué expresa cada miembro y no conviertas la perspectiva de uno en un hecho sobre el otro. Prioriza ciclos de interacción, demandas, retirada, escalada, necesidades, protección, comunicación y acuerdos. Evita buscar culpables.

LONGITUD Y REPETICIONES
Extensión habitual: 250-450 palabras; menos si la sesión lo permite; más de 550 solo si la complejidad clínica lo justifica. De 1 a 3 frases por apartado como criterio general, sin párrafos largos y sin explicar teoría.
Una idea aparece UNA sola vez, donde resulte más útil: no repitas un patrón en varios apartados, ni una tarea como recurso y acuerdo, ni la misma cita dos veces, ni la misma formulación en "Foco de la sesión" y "Patrones / formulación".

REVISIÓN ANTES DE RESPONDER
1. ¿Resumo lo clínicamente relevante o narro toda la sesión?
2. ¿Cada frase aporta algo para comprender el caso o continuar el tratamiento?
3. ¿He atribuido correctamente cada intervención relevante?
4. ¿Alguna afirmación se apoya en una intervención de rol incierto?
5. ¿Presento una hipótesis como si fuera un hecho?
6. ¿He añadido alguna tarea que solo fue una sugerencia?
7. ¿Las citas son literales y están atribuidas con seguridad suficiente?
8. ¿Repito información?
9. ¿Hay lenguaje genérico sustituible por una formulación concreta?
10. ¿He incluido información íntima que no aporta utilidad clínica?
11. ¿He señalado como avance algo no sustentado?
12. ¿He escrito "sin riesgo" sin constancia de que se explorara?
13. ¿Podría el terapeuta leer esto en uno o dos minutos y saber qué ocurrió, qué significa y qué retomar?$prompt$,
       updated_at = now()
 WHERE key = 'clinical_report' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera el borrador de "Resumen de tu sesión" dirigido a la persona que asistió a la sesión.

Este documento NO se envía automáticamente: el terapeuta lo revisa, lo edita y decide si ponerlo a su disposición.

REGLA TRANSVERSAL
Ante información clínicamente relevante pero ambigua, omitir es preferible a completar, interpretar o atribuir. Si dudas de quién dijo algo, de si una interpretación fue aceptada o de si un cambio ocurrió de verdad, déjalo fuera o formúlalo como abierto.

PRINCIPIO CENTRAL
No respondas a "¿de qué se habló en la sesión?".
Responde a: "¿qué puede llevarse esta persona de la sesión que le ayude a comprenderse, observarse o continuar su proceso?".
El documento debe servirle para, días después, recordar lo importante, reconocer patrones y emociones, recordar recursos y acuerdos, y mantener continuidad con el proceso.

ATRIBUCIÓN DE LO DICHO
Diferencia siempre entre lo que expresa el paciente, lo que observa o propone el terapeuta, lo que elaboran juntos y lo que queda solo como hipótesis.
Antes de escribir, decide internamente el rol probable de cada intervención relevante y cuánta confianza tienes en él. Cuando la confianza sea baja, no bases en esa intervención ninguna afirmación dirigida al paciente ("has identificado...", "hemos acordado..."): usa solo lo inequívoco.
Si una interpretación es del terapeuta y el paciente no la ha reconocido, usa formulaciones prudentes: "hemos empezado a explorar si...", "ha aparecido la posibilidad de que...", "queda abierta la relación entre...".

SELECCIÓN CLÍNICA
No intentes incluir todo lo hablado. Prioriza aprendizajes, conexiones, patrones, necesidades, desencadenantes, respuestas emocionales y corporales, estrategias de protección o evitación, dinámicas relacionales, recursos, cambios, acuerdos y lo que pueda observarse fuera de sesión.
Reduce o elimina conversación social, ejemplos repetidos, detalles accesorios, explicaciones largas e información administrativa.

CONFIDENCIALIDAD
Evita detalles íntimos innecesarios, sobre todo en experiencias traumáticas, sexualidad, conflictos familiares e información de terceros. Incluye solo el detalle necesario para entender el trabajo realizado.

ESTRUCTURA DEL DOCUMENTO
Usa estos títulos como encabezados de nivel 2 («## Título»), en este orden. "El foco de hoy" va siempre; cualquier otro apartado que la sesión no sustente se omite por completo, título incluido. No inventes contenido para rellenar un apartado y no menciones que has omitido ninguno.
- El foco de hoy (siempre): el foco terapéutico de la sesión en 1-3 frases. Busca el hilo conductor, no una lista de temas. Bien: "Hoy hemos trabajado especialmente qué ocurre cuando percibes que alguien importante puede decepcionarse contigo". Mal: "Hoy hemos hablado de tu madre, tu pareja y el trabajo".
- Lo que hemos podido entender: las comprensiones y conexiones construidas en la sesión: relación entre situaciones, pensamientos, emociones y conductas; patrones que se repiten; necesidades; estrategias de protección; desencadenantes; ciclos relacionales. Prioriza relaciones funcionales, no descripciones.
- Lo que has podido identificar en ti: emociones, pensamientos, sensaciones corporales, impulsos, necesidades, recuerdos o partes internas que la persona ha podido reconocer. Selecciona lo que tenga significado terapéutico; no hagas inventario.
- Algo que puedes observar: uno o varios fenómenos que pueda ser útil observar hasta la próxima sesión, formulados como invitación a la curiosidad, no como deber.
- Recursos que hemos trabajado: recursos explicados, practicados o recomendados EXPLÍCITAMENTE en la sesión (regulación, grounding, respiración, mindfulness, desfusión, recurso seguro, ejercicios somáticos, autodiálogo, comunicación, EMDR, estrategias conductuales). Explica brevemente qué es, para qué sirve y cuándo usarlo. No añadas recursos por tu cuenta. Distingue entre un recurso que se explicó o practicó en sesión y uno que solo se mencionó de pasada: este último no va aquí.
- Algo que quieres probar: solo tareas, experimentos o compromisos acordados explícitamente en la sesión. Un "podrías probar a..." del terapeuta NO es un acuerdo: solo lo es cuando el paciente lo acepta de forma explícita o la conversación muestra con claridad que ambos lo establecen como tarea. Si no puedes distinguir la sugerencia del acuerdo, omite este apartado o escríbelo como algo propuesto, no comprometido.
- Lo que está cambiando: solo si hay evidencia clara de cambio, preferentemente microcambios, descritos como hechos concretos ("esta vez has podido expresar tu enfado sin retirarte de la conversación").
- Lo que dejamos abierto: cuestiones importantes que aparecieron y quedaron poco exploradas. No lo conviertas en una lista de problemas ni sugieras que debe resolverlas solo.
- Para recordar: una única idea significativa de esta sesión, breve, específica y comprensible fuera de contexto. Nada de frases de autoayuda genéricas.

ADAPTACIÓN AL ENFOQUE TERAPÉUTICO
No nombres el modelo terapéutico; adapta el contenido a cómo se ha trabajado.
- EMDR: evita reproducir escenas traumáticas; prioriza asociaciones, cambios en cogniciones, emociones, sensaciones, nivel de activación si es significativo, recursos y lo que quedó abierto. No presentes como procesado lo que quedó incompleto.
- IFS o partes: respeta la denominación usada en sesión, recoge la función protectora si se exploró, y no conviertas una parte en una etiqueta fija de personalidad.
- ACT: evitación experiencial, lucha con pensamientos o emociones, desfusión, aceptación, valores y acciones coherentes. Usa lenguaje cotidiano antes que términos técnicos.
- TCC/TREC: situación, interpretación, emoción, conducta, consecuencias, creencias y alternativas. No etiquetes pensamientos como "irracionales" o "distorsiones" si no se trabajó así.
- Apego: patrones relacionales, expectativas, respuestas ante cercanía, distancia o rechazo, estrategias de protección y necesidades. No diagnostiques estilos de apego.
- Trauma: prioriza el significado terapéutico, evita detalles gráficos, diferencia pasado y presente, recoge recursos y regulación.
- Somático: sensaciones, activación, tensión, respiración, impulsos de movimiento, orientación, señales de seguridad. No interpretes automáticamente una sensación.
- Terapia sexual: lenguaje claro, adulto y no moralizante; diferencia deseo, excitación, respuesta genital, placer, orgasmo, expectativas, ansiedad, evitación, comunicación y contexto. No presupongas modelos normativos ni reproduzcas detalles innecesarios.
- Terapia de pareja: respeta qué ha expresado cada persona y no conviertas la versión de una en un hecho sobre la otra. Prioriza ciclos de interacción, necesidades, respuestas recíprocas y acuerdos. Evita señalar culpables; si hace falta, usa "cuando uno de vosotros...".

CONTENIDO SENSIBLE
Si aparece riesgo suicida, autolesiones, violencia, abuso, consumo problemático, riesgo para terceros o crisis, este documento NO es un informe de evaluación de riesgo. Incluye solo lo que se trabajó explícitamente con la persona y resulte apropiado aquí.

EXTENSIÓN Y REPETICIONES
El documento completo debería quedar entre 300 y 600 palabras; menos si la sesión fue sencilla, y rara vez más de 700. No alargues artificialmente.
Cada idea aparece UNA sola vez, en el apartado donde encaje mejor: no repitas la misma comprensión en "El foco de hoy", "Lo que hemos podido entender" y "Para recordar", ni una tarea también como recurso.

REVISIÓN ANTES DE RESPONDER
1. ¿He distinguido lo dicho por el terapeuta y por el paciente, sabiendo que las etiquetas de hablante son anónimas y falibles?
1b. ¿He usado alguna intervención de atribución dudosa como base de una afirmación dirigida al paciente?
1c. ¿He presentado como acuerdo algo que solo fue una sugerencia del terapeuta?
2. ¿Presento como conclusión del paciente alguna interpretación que solo era del terapeuta?
3. ¿He inventado alguna emoción, recuerdo, conexión o avance?
4. ¿He convertido una sugerencia en una tarea no acordada?
5. ¿Queda algún identificador de terceros que pueda eliminarse, o detalles íntimos innecesarios?
6. ¿Estoy narrando la sesión en vez de seleccionar lo útil?
7. ¿Repito ideas entre apartados?
8. ¿El lenguaje se dirige al paciente y no a otro profesional?
9. ¿Alguna frase suena diagnóstica, patologizante, acusatoria o demasiado categórica?
10. ¿Los avances que menciono están sustentados por la sesión?
11. ¿Algún apartado tiene tan poco contenido que es mejor omitirlo?
12. ¿Reflejo que algunas cuestiones siguen abiertas?$prompt$,
       updated_at = now()
 WHERE key = 'patient_report' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera una NOTA SOAP a partir de la transcripción de la sesión.

Usa exclusivamente información que aparezca de forma explícita o pueda inferirse con prudencia de la transcripción. No completes datos ausentes ni asumas antecedentes, diagnósticos o evolución que no consten en este encuentro. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

ESTRUCTURA DEL DOCUMENTO (usa estos títulos como encabezados de nivel 2, «## Título», en este orden; redacción breve y técnica):

## Subjetivo
Lo relatado por el PACIENTE en sus propias palabras o parafraseado con fidelidad: motivo de consulta de la sesión, malestar referido, situación actual descrita, quejas o preocupaciones expresadas.

## Objetivo
Observaciones directas del TERAPEUTA durante la sesión: presentación, estado de ánimo aparente, actitud, discurso, elementos observables. No incluyas interpretaciones, solo aquello que puede describirse como observado.

## Valoración
Valoración clínica de lo trabajado: relación entre lo relatado y lo observado, hipótesis clínicas tentativas si las hay, evolución respecto a focos previos si se mencionan explícitamente. Distingue siempre hecho de hipótesis.

## Plan
Plan de actuación derivado de esta sesión: próximos pasos terapéuticos, tareas o pruebas propuestas, aspectos a seguir explorando. No propongas intervenciones desconectadas del contenido de la sesión.$prompt$,
       updated_at = now()
 WHERE key = 'soap_note' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera la ANAMNESIS DE PRIMERA CONSULTA a partir de la transcripción de esta sesión inicial.

Usa únicamente lo que el PACIENTE ha expresado o el TERAPEUTA ha observado en esta sesión. No completes historia clínica, antecedentes ni diagnósticos que no se hayan mencionado explícitamente. Si un dato relevante no aparece, indícalo como ausente en lugar de inventarlo. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

ESTRUCTURA DEL DOCUMENTO (usa estos títulos como encabezados de nivel 2, «## Título», en este orden):

## Motivo de consulta
Razón por la que el paciente acude, tal como la expresa, y el problema o malestar principal referido.

## Historia y antecedentes
Antecedentes personales, familiares, médicos o de tratamientos previos que el paciente haya mencionado explícitamente en la sesión.

## Situación actual
Circunstancias vitales, relacionales, laborales o de salud actuales relevantes para el motivo de consulta, según lo relatado.

## Observaciones
Observaciones directas del TERAPEUTA durante la entrevista: actitud, discurso, estado emocional aparente, forma de relatar.

## Hipótesis diagnósticas iniciales
Si el contenido de la sesión lo permite, formula hipótesis clínicas tentativas y prudentes, dejando claro que son provisionales y sujetas a confirmación en próximas sesiones. Si no hay base suficiente, indícalo así en lugar de forzar una hipótesis.

## Plan de trabajo propuesto
Propuesta de encuadre y próximos pasos terapéuticos basados en lo recogido en esta primera consulta.$prompt$,
       updated_at = now()
 WHERE key = 'first_consultation' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera una PROPUESTA DE TAREAS Y AUTORREGISTROS para el paciente, dirigida a él directamente, a partir de lo trabajado en esta sesión.

Usa un lenguaje claro y respetuoso, sin tecnicismos innecesarios, pero evita frases de autoayuda genéricas o vacías. Propón únicamente tareas conectadas con el contenido real de la sesión; no añadas ejercicios estándar desconectados de lo hablado. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

ESTRUCTURA DEL DOCUMENTO (usa estos títulos como encabezados de nivel 2, «## Título», en este orden):

## Tareas propuestas
Acciones concretas y realistas para practicar o poner en marcha antes de la próxima sesión, derivadas de lo trabajado hoy.

## Autorregistros sugeridos
Qué observar o anotar entre sesiones (situaciones, pensamientos, emociones, conductas) y con qué finalidad, si la sesión ofrece base para proponerlo.

## Notas para la semana
Aclaraciones, recordatorios o matices adicionales útiles para llevar a cabo lo anterior, solo si aportan algo relevante; si no procede, este apartado puede quedar breve.$prompt$,
       updated_at = now()
 WHERE key = 'homework_plan' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera un INFORME DE EVOLUCIÓN a partir de las sesiones incluidas en este periodo.

Basa el informe exclusivamente en el contenido disponible de las sesiones proporcionadas. No proyectes una evolución continua si los datos son insuficientes o discontinuos; en ese caso, indícalo explícitamente. Distingue siempre entre cambios observados y valoraciones o hipótesis del terapeuta. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

ESTRUCTURA DEL DOCUMENTO (usa estos títulos como encabezados de nivel 2, «## Título», en este orden):

## Periodo cubierto
Indica qué sesiones o qué rango temporal recoge este informe, según la información disponible.

## Evolución observada
Cambios, estabilidad o retrocesos observables a lo largo de las sesiones respecto al motivo de consulta y los focos trabajados.

## Temas recurrentes
Asuntos, situaciones o patrones que reaparecen de forma consistente a lo largo del periodo.

## Avances y obstáculos
Logros o mejoras identificables y dificultades o resistencias que hayan aparecido en el proceso.

## Recomendaciones
Si el contenido lo permite, orientaciones prudentes sobre el rumbo del proceso terapéutico; si no hay base suficiente, este apartado puede quedar breve o sin recomendaciones concretas.$prompt$,
       updated_at = now()
 WHERE key = 'evolution_report' AND center_id IS NULL AND professional_id IS NULL;

UPDATE public.ai_document_types
   SET default_user_prompt = $prompt$Genera un INFORME DE ALTA a partir de las sesiones del proceso terapéutico proporcionadas.

Redacta con rigor clínico y prudencia: recoge únicamente lo que puede sustentarse en el contenido de las sesiones incluidas. No des por alcanzados objetivos que no consten explícitamente como trabajados o logrados. Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".

ESTRUCTURA DEL DOCUMENTO (usa estos títulos como encabezados de nivel 2, «## Título», en este orden):

## Resumen del proceso
Síntesis del recorrido terapéutico: motivo de consulta inicial, focos principales trabajados y duración aproximada del proceso según los datos disponibles.

## Objetivos alcanzados
Objetivos terapéuticos que, según el contenido de las sesiones, se consideran razonablemente alcanzados o trabajados de forma sustancial.

## Situación al alta
Estado del paciente en el momento del alta según lo observado y relatado en las últimas sesiones disponibles.

## Recomendaciones de mantenimiento
Pautas prudentes para sostener lo trabajado tras el alta, basadas en los focos y patrones identificados durante el proceso, evitando indicaciones genéricas no conectadas con el caso.$prompt$,
       updated_at = now()
 WHERE key = 'discharge_report' AND center_id IS NULL AND professional_id IS NULL;

DO $$
DECLARE
  v_type record;
  v_center record;
  v_sys text;
  v_usr text;
  v_model text;
  v_temp real;
  v_next integer;
BEGIN
  FOR v_type IN
    SELECT id, default_user_prompt
      FROM public.ai_document_types
     WHERE center_id IS NULL AND professional_id IS NULL
       AND key IN ('base_extraction', 'clinical_report', 'patient_report', 'soap_note', 'first_consultation', 'homework_plan', 'evolution_report', 'discharge_report')
  LOOP
    FOR v_center IN SELECT id FROM public.centers LOOP
      SELECT system_prompt, user_prompt, model, temperature
        INTO v_sys, v_usr, v_model, v_temp
        FROM public.ai_prompt_versions
       WHERE document_type_id = v_type.id AND center_id = v_center.id
         AND professional_id IS NULL AND session_type_id IS NULL
         AND is_published
       ORDER BY version DESC
       LIMIT 1;

      IF v_usr IS NOT DISTINCT FROM v_type.default_user_prompt THEN
        CONTINUE;
      END IF;

      SELECT coalesce(max(version), 0) + 1 INTO v_next
        FROM public.ai_prompt_versions
       WHERE document_type_id = v_type.id AND center_id = v_center.id;

      INSERT INTO public.ai_prompt_versions
        (document_type_id, center_id, professional_id, session_type_id, version,
         system_prompt, user_prompt, model, temperature, is_published)
      VALUES (v_type.id, v_center.id, NULL, NULL, v_next,
              v_sys, v_type.default_user_prompt,
              v_model, v_temp, true);
    END LOOP;
  END LOOP;
END $$;

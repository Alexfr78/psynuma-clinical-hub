-- Corrige el fallo verificado en producción de la ingesta de grabaciones
-- Plaud: cuando `sync-plaud-recordings` importaba un archivo antes de que
-- Plaud lo hubiera transcrito, la fila se guardaba con `transcript_text`
-- vacío pero YA CLASIFICADA (`status = 'matched'` o `'needs_review'`, según
-- el emparejamiento por metadatos). La deduplicación por
-- `(center_id, plaud_file_id)` excluía después cualquier fila que no
-- estuviera en `error`, así que esa transcripción nunca se volvía a pedir —
-- y sin transcripción, `detectSegmentation` nunca puede detectar que el
-- archivo mezcla el contenido de dos pacientes. Ver cabecera actualizada de
-- `supabase/functions/sync-plaud-recordings/index.ts` para el diseño
-- completo del reintento.
--
-- Esta migración solo añade columnas de seguimiento; NO cambia el CHECK de
-- `status` (sigue permitiendo 'pending', que ya existía sin usarse, y que
-- ahora pasa a significar "importada, sin transcripción todavía, ni
-- emparejada ni descartada" — invisible para la bandeja de revisión y para
-- el botón de generar informes, exactamente el estado "nada que hacer
-- todavía" que pedía el encargo, sin tocar `src/**`).

ALTER TABLE public.plaud_recordings
  ADD COLUMN transcript_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN transcript_retry_gave_up_at TIMESTAMPTZ,
  ADD COLUMN segmentation_unverified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN flagged_after_confirmation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plaud_recordings.transcript_attempts IS
  'Número de ciclos de sync-plaud-recordings en los que se ha pedido la transcripción de este archivo (con o sin éxito). Junto con created_at, decide cuándo se deja de reintentar — ver TRANSCRIPT_RETRY_MAX_ATTEMPTS / TRANSCRIPT_RETRY_MAX_AGE_DAYS en el edge function.';

COMMENT ON COLUMN public.plaud_recordings.transcript_retry_gave_up_at IS
  'Se rellena solo cuando la ingesta agota el límite de reintentos de transcripción SIN que nunca llegara texto y SIN que hubiera una decisión humana previa: en ese caso la fila se fuerza a needs_review (ver match_reasons: ''transcript_retry_exhausted'') para que una persona decida en vez de dejarla en pending para siempre. NULL en cualquier otro caso, incluidas las filas que sí llegaron a tener transcripción.';

COMMENT ON COLUMN public.plaud_recordings.segmentation_unverified IS
  'true mientras contains_multiple_sessions/segmentation_* NO se han calculado a partir de una transcripción real (transcript_text seguía vacío la última vez que se procesó esta fila). Es la señal explícita de "no lo sabemos" — necesaria porque contains_multiple_sessions = false por sí solo es ambiguo entre "se comprobó y no hay riesgo" y "nunca se pudo comprobar". Pasa a false en cuanto llega una transcripción real y se recalcula la segmentación, sea cual sea el resultado.';

COMMENT ON COLUMN public.plaud_recordings.flagged_after_confirmation IS
  'true cuando, DESPUÉS de que una persona ya hubiera confirmado a mano el emparejamiento (matched_by = ''manual''), llega la transcripción y la segmentación recalculada detecta sospecha de varias sesiones. Es el caso de riesgo señalado explícitamente en el encargo: puede significar que el relato de un paciente se mezcló con la ficha de otro. La ingesta NUNCA deshace ni modifica el emparejamiento o el estado en este caso -- se limita a levantar esta bandera, visible además de forma inmediata en la bandeja porque contains_multiple_sessions (que sí se recalcula) ya se muestra sin condición en PlaudRecordingCard.tsx incluso en modo solo lectura. Una vez puesta a true no se vuelve a poner a false automáticamente: es una advertencia duradera hasta que alguien la revise a mano (no hay mecanismo de "descartar la alerta" en este lote; ver informe de entrega).';

-- Índice de soporte para la consulta de reintento: filas sin transcripción
-- todavía, dentro de presupuesto de intentos/antigüedad. Parcial porque la
-- inmensa mayoría de filas SÍ tendrán transcript_text una vez resuelto su
-- ciclo de vida (o habrán expirado por retención de 30 días, ver
-- cleanup_expired_plaud_transcripts) -- indexar solo las relevantes para el
-- reintento evita inflar el índice con historial ya resuelto.
CREATE INDEX idx_plaud_recordings_pending_transcript
  ON public.plaud_recordings (center_id, created_at)
  WHERE transcript_text IS NULL;

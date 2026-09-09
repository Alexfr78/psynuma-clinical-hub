-- Fase 6: migración de datos legacy de schedule_exceptions a special_days.
--
-- Estrategia:
--   * No mueve ni borra registros: duplica los compatibles como special_days
--     de tipo 'closed', dejando schedule_exceptions intacta para no romper
--     consumidores legacy ni perder histórico.
--   * Solo se migran exclusiones que el usuario realmente percibe como
--     "día no operativo" en las superficies públicas: all_day = true
--     y affects_booking = true.
--   * Idempotencia: se marca el registro creado con un sello en notes
--     "[legacy:schedule_exception:<uuid>]" y se omite si ya existe.
--   * Tolerante a solapes: cada inserción va en su propio savepoint para
--     que un EXCLUDE constraint (special_days_no_overlap_*) no aborte
--     el resto de la migración. Se reporta cuántos se omitieron.

DO $$
DECLARE
  rec RECORD;
  inserted_count INT := 0;
  skipped_overlap_count INT := 0;
  skipped_existing_count INT := 0;
  computed_label TEXT;
  computed_notes TEXT;
BEGIN
  FOR rec IN
    SELECT se.*
    FROM public.schedule_exceptions se
    WHERE se.all_day = TRUE
      AND se.affects_booking = TRUE
  LOOP
    -- Skip si ya migrado previamente (idempotencia).
    IF EXISTS (
      SELECT 1
      FROM public.special_days sd
      WHERE sd.notes LIKE '%[legacy:schedule_exception:' || rec.id::text || ']%'
    ) THEN
      skipped_existing_count := skipped_existing_count + 1;
      CONTINUE;
    END IF;

    -- Label legible: usa reason_label si lo tiene, si no traduce reason_type.
    computed_label := COALESCE(
      NULLIF(TRIM(rec.reason_label), ''),
      CASE rec.reason_type
        WHEN 'holiday'    THEN 'Festivo'
        WHEN 'vacation'   THEN 'Vacaciones'
        WHEN 'sick_leave' THEN 'Baja médica'
        WHEN 'training'   THEN 'Formación'
        WHEN 'closure'    THEN 'Cierre del centro'
        ELSE 'Día no laborable'
      END
    );

    computed_notes := TRIM(BOTH E'\n' FROM
      COALESCE(rec.notes, '') ||
      CASE WHEN COALESCE(rec.notes, '') = '' THEN '' ELSE E'\n' END ||
      '[legacy:schedule_exception:' || rec.id::text || ']'
    );

    BEGIN
      INSERT INTO public.special_days (
        center_id,
        professional_id,
        scope,
        type,
        start_date,
        end_date,
        label,
        notes,
        affects_public_booking,
        created_by,
        created_at
      ) VALUES (
        rec.center_id,
        rec.professional_id,
        rec.scope::text::public.special_day_scope,
        'closed'::public.special_day_type,
        rec.start_date,
        rec.end_date,
        computed_label,
        computed_notes,
        TRUE,
        rec.created_by,
        COALESCE(rec.created_at, now())
      );
      inserted_count := inserted_count + 1;
    EXCEPTION
      WHEN exclusion_violation THEN
        -- Ya existe un special_day del mismo ámbito que solapa con este rango;
        -- lo dejamos sin migrar para no pisar el dato más reciente.
        skipped_overlap_count := skipped_overlap_count + 1;
        RAISE NOTICE
          'Skipped overlap: schedule_exception % (% - %, scope=%, prof=%)',
          rec.id, rec.start_date, rec.end_date, rec.scope, rec.professional_id;
    END;
  END LOOP;

  RAISE NOTICE
    'Legacy migration summary: inserted=%, skipped_existing=%, skipped_overlap=%',
    inserted_count, skipped_existing_count, skipped_overlap_count;
END $$;

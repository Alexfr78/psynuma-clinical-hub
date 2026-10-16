-- El cron diario de deudas (generate-pending-debts-db, 06:00) aplica primero
-- los bonos disponibles.
--
-- Antes, una sesión pasada sin bono generaba deuda aunque el paciente (o su
-- pareja, si el bono es compartido) tuviera un bono activo con sesiones libres.
-- Alguien tenía que verlo en Cobros y pulsar "Asignar bono".
--
-- Ahora, antes de crear deudas, se recorren las sesiones pasadas pendientes de
-- pago y sin bono y se les aplica el bono activo, no caducado y con cupo que
-- caduque antes (mismo orden que _shared/bonoAutomation.ts). También cubre las
-- sesiones que ya tenían una deuda pendiente sin pagar ni facturar: la deuda se
-- borra dentro de apply_bono_to_session_service.

CREATE OR REPLACE FUNCTION public.generate_pending_debts_db()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  created_count integer := 0;
  applied_count integer := 0;
  failed_count integer := 0;
  v_session record;
  v_bono_id uuid;
BEGIN
  FOR v_session IN
    SELECT s.id, s.patient_id, s.center_id, s.session_date
    FROM sessions s
    WHERE s.session_date < CURRENT_DATE
      AND s.payment_status = 'pending'
      -- Solo citas confirmadas, como bonoAutomation.ts (que aplica al quedar
      -- 'scheduled'). Un 'draft' o 'pending_approval' que nadie aprobó no
      -- debe gastar bono.
      AND s.status IN ('scheduled', 'confirmed', 'completed')
      AND s.bono_id IS NULL
      AND s.price > 0
      -- Ni con un pago con tarjeta en curso ni con cobros registrados.
      AND COALESCE(s.stripe_payment_status, '') <> 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.session_id = s.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM invoice_items ii WHERE ii.session_id = s.id
      )
      -- Sin deuda, o solo con deudas pendientes que nadie ha pagado ni facturado.
      AND NOT EXISTS (
        SELECT 1 FROM debts d
        WHERE d.session_id = s.id
          AND (
            d.status <> 'pending'
            OR COALESCE(d.paid_amount, 0) <> 0
            OR d.invoice_id IS NOT NULL
            OR d.bono_id IS NOT NULL
          )
      )
    ORDER BY s.session_date ASC, s.start_time ASC
  LOOP
    SELECT b.id INTO v_bono_id
    FROM bonos b
    WHERE b.center_id = v_session.center_id
      AND v_session.patient_id IN (b.patient_id, b.shared_with_patient_id)
      -- No se gasta en sesiones anteriores a la compra del bono.
      AND b.created_at::date <= v_session.session_date
      AND b.status = 'active'
      AND COALESCE(b.used_sessions, 0) < COALESCE(b.total_sessions, 0)
      AND (b.expires_at IS NULL OR b.expires_at >= now())
    ORDER BY b.expires_at ASC NULLS LAST, b.created_at ASC
    LIMIT 1;

    CONTINUE WHEN v_bono_id IS NULL;

    BEGIN
      PERFORM apply_bono_to_session_service(v_bono_id, v_session.id);
      applied_count := applied_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Un fallo en una sesión no frena el cron: esa sesión sigue el camino
      -- normal y recibe su deuda.
      failed_count := failed_count + 1;
      RAISE WARNING 'generate_pending_debts_db: no se pudo aplicar el bono % a la sesión %: %',
        v_bono_id, v_session.id, SQLERRM;
    END;
  END LOOP;

  INSERT INTO debts (patient_id, center_id, session_id, amount, paid_amount, status, due_date, notes)
  SELECT
    s.patient_id,
    s.center_id,
    s.id,
    s.price,
    0,
    'pending',
    s.session_date,
    'Deuda generada automáticamente para sesión del ' || s.session_date::text
  FROM sessions s
  WHERE s.session_date < CURRENT_DATE
    AND s.payment_status = 'pending'
    AND s.status NOT IN ('cancelled', 'no_show', 'blocked')
    AND s.bono_id IS NULL
    AND s.price > 0
    AND NOT EXISTS (
      SELECT 1 FROM debts d
      WHERE d.session_id = s.id
        AND d.status <> 'refunded'
    )
    AND NOT EXISTS (
      SELECT 1 FROM invoice_items ii WHERE ii.session_id = s.id
    );

  GET DIAGNOSTICS created_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'created', created_count,
    'bonos_applied', applied_count,
    'bonos_failed', failed_count,
    'timestamp', now()
  );
END;
$function$;

-- Recorre todos los centros y gasta bonos: solo el cron (postgres) y
-- service_role pueden llamarla. Antes cualquier usuario autenticado podía.
REVOKE ALL ON FUNCTION public.generate_pending_debts_db() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pending_debts_db() TO service_role;

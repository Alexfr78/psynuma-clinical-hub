-- Cancelación de sesiones de pareja con confirmación del otro miembro.
--
-- Cuando un miembro cancela una sesión de pareja desde un enlace público o el
-- portal, la sesión NO se cancela todavía: se crea una solicitud y se pregunta
-- al otro miembro si también cancela o prefiere asistir solo.
--   * "También cancelo"  → se cancela para los dos (status = cancelled_both).
--   * "Voy yo solo"      → la sesión pasa a individual a su nombre
--                          (status = converted_individual); quien canceló sale.
--   * Sin respuesta en plazo → se cancela para los dos (status = expired_cancelled).
-- El cargo por cancelación tardía se evalúa en el momento de la primera
-- cancelación y, si al final se cancela, se imputa a quien canceló primero.
-- Si el profesional cancela desde la agenda, cancela directamente (no pasa por aquí).

CREATE TABLE IF NOT EXISTS public.couple_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  requested_by_patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  other_patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled_both', 'converted_individual', 'expired_cancelled', 'withdrawn')),
  -- Token del enlace de respuesta; solo se manda al otro miembro.
  response_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  deadline_at timestamptz NOT NULL,
  cancellation_reason text,
  requested_via text NOT NULL DEFAULT 'session_link'
    CHECK (requested_via IN ('session_link', 'portal', 'booking_manage')),
  -- Evaluación del cargo en el momento de la primera cancelación (para quien canceló).
  charge_applies boolean NOT NULL DEFAULT false,
  charge_amount numeric(10,2),
  charge_percentage numeric(5,2),
  charge_base_price numeric(10,2),
  charge_policy_version_id uuid,
  charge_concept text,
  resolved_at timestamptz,
  resolved_by text CHECK (resolved_by IN ('partner', 'timeout', 'professional')),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT couple_cancellation_distinct_members CHECK (requested_by_patient_id <> other_patient_id)
);

-- Una sola solicitud abierta por sesión.
CREATE UNIQUE INDEX IF NOT EXISTS couple_cancellation_one_pending_per_session
  ON public.couple_cancellation_requests (session_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS couple_cancellation_pending_deadline_idx
  ON public.couple_cancellation_requests (deadline_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.couple_cancellation_requests IS
  'Cancelación de una sesión de pareja por un miembro, pendiente de que el otro confirme si también cancela o asiste solo.';

DROP TRIGGER IF EXISTS couple_cancellation_requests_updated_at ON public.couple_cancellation_requests;
CREATE TRIGGER couple_cancellation_requests_updated_at
  BEFORE UPDATE ON public.couple_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.couple_cancellation_requests ENABLE ROW LEVEL SECURITY;

-- El equipo del centro las ve (agenda / detalle de la cita). Las crean y
-- resuelven solo las edge functions con service_role.
CREATE POLICY "View couple cancellation requests in center" ON public.couple_cancellation_requests
  FOR SELECT TO authenticated
  USING (center_id = get_user_center_id(auth.uid()));

REVOKE ALL ON TABLE public.couple_cancellation_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.couple_cancellation_requests TO authenticated;
GRANT ALL ON TABLE public.couple_cancellation_requests TO service_role;

-- ─── Tipo individual al que pasa una sesión de pareja si va solo uno ─────────
ALTER TABLE public.session_types
  ADD COLUMN IF NOT EXISTS individual_fallback_type_id uuid
    REFERENCES public.session_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.session_types.individual_fallback_type_id IS
  'Solo en tipos de pareja: tipo individual al que pasa la sesión si solo asiste un miembro. NULL = el primer tipo individual activo.';

-- ─── Cron: vencer solicitudes sin respuesta (se cancela para los dos) ────────
DO $cron$
BEGIN
  PERFORM cron.unschedule('expire-couple-cancellations-cron')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-couple-cancellations-cron');
  PERFORM cron.schedule(
    'expire-couple-cancellations-cron',
    '*/15 * * * *',
    $sql$SELECT net.http_post(
           url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/couple-cancellation',
           headers := jsonb_build_object(
             'Content-Type','application/json',
             'x-cron-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),'')
           ),
           body := '{"action":"expire"}'::jsonb
         );$sql$
  );
END
$cron$;

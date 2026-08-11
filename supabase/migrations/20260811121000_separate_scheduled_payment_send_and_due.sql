-- A scheduled payment has two distinct moments:
-- 1. when the patient receives the payment link;
-- 2. the deadline by which the session must be paid.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS advance_payment_send_at timestamptz;

COMMENT ON COLUMN public.sessions.advance_payment_send_at IS
  'When the scheduled advance-payment link may first be sent to the patient.';

UPDATE public.sessions AS s
SET advance_payment_send_at =
  ((s.session_date + s.start_time) AT TIME ZONE 'Europe/Madrid')
  - make_interval(
      hours => GREATEST(
        COALESCE(c.default_scheduled_hours_before, 24),
        COALESCE(s.advance_payment_limit_hours, c.default_advance_payment_limit_hours, 12) + 1
      )
    )
FROM public.centers AS c
WHERE c.id = s.center_id
  AND s.payment_mode = 'scheduled_before'
  AND s.advance_payment_send_at IS NULL
  AND s.status IN ('scheduled', 'pending_approval');

CREATE INDEX IF NOT EXISTS sessions_scheduled_payment_send_idx
  ON public.sessions (advance_payment_send_at)
  WHERE payment_mode = 'scheduled_before'
    AND advance_payment_notification_sent_at IS NULL
    AND status = 'scheduled';

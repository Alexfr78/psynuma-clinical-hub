-- Bloqueo de reservas online por paciente.
--
-- Un paciente bloqueado no puede reservar ni reprogramar desde la reserva
-- pública, el portal ni /cita, pero conserva el acceso al portal para ver
-- facturas y documentos. Las reservas con otro email que coinciden por
-- teléfono o nombre completo con un paciente bloqueado quedan pendientes de
-- aprobación (lo resuelven las edge functions, no la base de datos).
--
--   booking_blocked         true = no puede reservar online.
--   booking_blocked_reason  motivo interno; nunca se muestra al paciente.
--   booking_blocked_at      cuándo se activó el bloqueo.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS booking_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_blocked_reason text,
  ADD COLUMN IF NOT EXISTS booking_blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_patients_booking_blocked
  ON public.patients (center_id)
  WHERE booking_blocked;

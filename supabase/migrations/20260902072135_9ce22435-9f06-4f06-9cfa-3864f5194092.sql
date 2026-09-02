-- Permite restringir la disponibilidad semanal de un profesional a un tipo de
-- sesión concreto (ej. "Supervisión online" solo lunes y viernes), sin afectar
-- a los demás tipos de sesión ni a la ubicación en la que se imparten.
--
-- session_type_id = NULL  → franja general del profesional (comportamiento
--                            actual, aplica a cualquier tipo de sesión).
-- session_type_id = <id>  → franja específica de ese tipo de sesión para ese
--                            profesional/día; solo esos días quedan abiertos
--                            para ese tipo de sesión.
ALTER TABLE public.availability
ADD COLUMN IF NOT EXISTS session_type_id UUID REFERENCES public.session_types(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_availability_session_type_id
ON public.availability(session_type_id)
WHERE session_type_id IS NOT NULL;

COMMENT ON COLUMN public.availability.session_type_id IS
'Si no es NULL, esta franja de disponibilidad solo aplica al tipo de sesión indicado (restringe, no sustituye, la disponibilidad general del profesional para ese servicio).';
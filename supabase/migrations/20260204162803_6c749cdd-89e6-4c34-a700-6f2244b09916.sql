-- Añadir nuevos campos para el sistema automático de estados de contactos
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS status_source text DEFAULT 'auto' CHECK (status_source IN ('manual', 'auto')),
ADD COLUMN IF NOT EXISTS status_reason text,
ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();

-- Actualizar valores existentes: si status='discharged', marcarlo como manual
UPDATE public.patients 
SET status_source = 'manual', status_updated_at = now()
WHERE status = 'discharged';

-- Crear función para calcular el estado automático de un contacto
CREATE OR REPLACE FUNCTION public.compute_patient_status(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_patient RECORD;
  v_has_future_session boolean;
  v_last_completed_session timestamptz;
  v_result jsonb;
  v_new_status patient_status;
  v_reason text;
BEGIN
  -- Obtener el paciente
  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Patient not found');
  END IF;
  
  -- Si está marcado manualmente como 'discharged', no cambiar
  IF v_patient.status = 'discharged' AND v_patient.status_source = 'manual' THEN
    RETURN jsonb_build_object(
      'status', 'discharged',
      'source', 'manual',
      'reason', 'manual_discharge',
      'changed', false
    );
  END IF;
  
  -- Verificar si tiene cita futura vigente (no cancelada, no no_show)
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE patient_id = p_patient_id
    AND (
      -- Cita futura: session_date > hoy, O session_date = hoy Y start_time > ahora
      (session_date > CURRENT_DATE)
      OR (session_date = CURRENT_DATE AND start_time > CURRENT_TIME)
    )
    AND status IN ('scheduled', 'confirmed', 'pending_approval', 'reschedule_requested')
  ) INTO v_has_future_session;
  
  IF v_has_future_session THEN
    v_new_status := 'active';
    v_reason := 'future_appointment';
  ELSE
    -- Buscar última sesión completada
    SELECT MAX(
      (session_date || ' ' || start_time)::timestamptz
    ) INTO v_last_completed_session
    FROM public.sessions
    WHERE patient_id = p_patient_id
    AND status = 'completed';
    
    IF v_last_completed_session IS NOT NULL AND 
       v_last_completed_session >= (NOW() - INTERVAL '30 days') THEN
      v_new_status := 'active';
      v_reason := 'last_session_within_30d';
    ELSE
      v_new_status := 'inactive';
      v_reason := 'inactive_no_activity';
    END IF;
  END IF;
  
  -- Actualizar solo si cambió o si era manual y ahora debe ser auto
  IF v_patient.status != v_new_status OR v_patient.status_source != 'auto' THEN
    UPDATE public.patients
    SET 
      status = v_new_status,
      status_source = 'auto',
      status_reason = v_reason,
      status_updated_at = NOW(),
      updated_at = NOW()
    WHERE id = p_patient_id
    AND (status_source = 'auto' OR status != 'discharged'); -- No sobrescribir discharge manual
    
    RETURN jsonb_build_object(
      'status', v_new_status,
      'source', 'auto',
      'reason', v_reason,
      'changed', true,
      'previous_status', v_patient.status
    );
  END IF;
  
  RETURN jsonb_build_object(
    'status', v_new_status,
    'source', 'auto',
    'reason', v_reason,
    'changed', false
  );
END;
$$;

-- Función para marcar manualmente un contacto como ALTA
CREATE OR REPLACE FUNCTION public.set_patient_discharged(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
BEGIN
  -- Verificar permisos
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- Verificar que el paciente pertenece al centro
  SELECT center_id INTO v_patient_center_id
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;
  
  -- Verificar rol
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.patients
  SET 
    status = 'discharged',
    status_source = 'manual',
    status_reason = 'manual_discharge',
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_patient_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', 'discharged',
    'source', 'manual'
  );
END;
$$;

-- Función para quitar el ALTA y volver al cálculo automático
CREATE OR REPLACE FUNCTION public.remove_patient_discharged(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
  v_result jsonb;
BEGIN
  -- Verificar permisos
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- Verificar que el paciente pertenece al centro
  SELECT center_id INTO v_patient_center_id
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;
  
  -- Verificar rol
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  -- Recalcular estado automáticamente
  v_result := public.compute_patient_status(p_patient_id);
  
  RETURN v_result;
END;
$$;

-- Función para recalcular todos los pacientes de un centro
CREATE OR REPLACE FUNCTION public.recompute_all_patient_statuses(p_center_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_patient RECORD;
  v_updated_count int := 0;
  v_total_count int := 0;
  v_center_filter uuid;
BEGIN
  v_center_filter := COALESCE(p_center_id, get_user_center_id(auth.uid()));
  
  FOR v_patient IN 
    SELECT id FROM public.patients 
    WHERE center_id = v_center_filter
    AND (status_source = 'auto' OR status_source IS NULL OR status != 'discharged')
  LOOP
    PERFORM public.compute_patient_status(v_patient.id);
    v_total_count := v_total_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed', v_total_count,
    'center_id', v_center_filter
  );
END;
$$;

-- Trigger function para actualizar estado cuando cambian las sesiones
CREATE OR REPLACE FUNCTION public.trigger_update_patient_status_on_session_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  -- Determinar el patient_id afectado
  IF TG_OP = 'DELETE' THEN
    v_patient_id := OLD.patient_id;
  ELSE
    v_patient_id := NEW.patient_id;
  END IF;
  
  -- Si el paciente está en ALTA manual, no recalcular
  IF EXISTS (
    SELECT 1 FROM public.patients 
    WHERE id = v_patient_id 
    AND status = 'discharged' 
    AND status_source = 'manual'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Recalcular estado del paciente
  PERFORM public.compute_patient_status(v_patient_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Crear trigger en sessions para INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trigger_session_patient_status ON public.sessions;
CREATE TRIGGER trigger_session_patient_status
AFTER INSERT OR UPDATE OF status, session_date, patient_id OR DELETE
ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_patient_status_on_session_change();

-- Inicializar status_source para pacientes existentes que no sean discharged
UPDATE public.patients
SET 
  status_source = CASE 
    WHEN status = 'discharged' THEN 'manual'
    ELSE 'auto'
  END,
  status_updated_at = NOW()
WHERE status_source IS NULL;
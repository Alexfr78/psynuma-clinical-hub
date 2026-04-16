-- Special Days feature (Fase 1: modelo de datos)
-- Overrides del horario semanal a nivel centro o profesional, con prioridad
-- profesional > centro > semanal. Ver docs internos del equipo.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ENUMs
CREATE TYPE public.special_day_scope AS ENUM ('center', 'professional');
CREATE TYPE public.special_day_type  AS ENUM ('closed', 'custom', 'extended');

-- Tabla principal
CREATE TABLE public.special_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope public.special_day_scope NOT NULL,
  type  public.special_day_type  NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  label TEXT,
  notes TEXT,
  affects_public_booking BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT special_days_valid_scope CHECK (
    (scope = 'center'       AND professional_id IS NULL) OR
    (scope = 'professional' AND professional_id IS NOT NULL)
  ),
  CONSTRAINT special_days_valid_dates CHECK (end_date >= start_date)
);

-- Evitar solapes dentro del mismo ámbito+sujeto.
-- Dos constraints parciales: la de centro no compara professional_id (siempre NULL
-- en ese scope), y la de profesional lo exige NOT NULL.
ALTER TABLE public.special_days
  ADD CONSTRAINT special_days_no_overlap_center
  EXCLUDE USING gist (
    center_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (scope = 'center');

ALTER TABLE public.special_days
  ADD CONSTRAINT special_days_no_overlap_professional
  EXCLUDE USING gist (
    center_id       WITH =,
    professional_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (scope = 'professional' AND professional_id IS NOT NULL);

-- Índices de lectura (resolver mensual/diario).
CREATE INDEX idx_special_days_center_range
  ON public.special_days (center_id, start_date, end_date)
  WHERE scope = 'center';

CREATE INDEX idx_special_days_professional_range
  ON public.special_days (center_id, professional_id, start_date, end_date)
  WHERE scope = 'professional';

-- Tabla hija: franjas horarias.
-- Sin location_id en Fase 1 (pospuesto; la intersección con location_schedules
-- en el resolver cubre el 100% de casos actuales).
CREATE TABLE public.special_day_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  special_day_id UUID NOT NULL REFERENCES public.special_days(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT special_day_slots_valid_range CHECK (end_time > start_time)
);

CREATE INDEX idx_special_day_slots_parent
  ON public.special_day_slots (special_day_id);

-- Trigger updated_at en la tabla padre.
CREATE OR REPLACE FUNCTION public.special_days_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_special_days_updated_at
  BEFORE UPDATE ON public.special_days
  FOR EACH ROW
  EXECUTE FUNCTION public.special_days_set_updated_at();

CREATE TRIGGER trg_special_day_slots_updated_at
  BEFORE UPDATE ON public.special_day_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.special_days_set_updated_at();

-- RLS: modelo análogo a schedule_exceptions.
ALTER TABLE public.special_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_day_slots ENABLE ROW LEVEL SECURITY;

-- special_days
CREATE POLICY "View special days in center"
  ON public.special_days FOR SELECT
  TO public
  USING (center_id = get_user_center_id(auth.uid()));

-- Admins del centro: control total sobre special_days del centro.
CREATE POLICY "Admins manage special days"
  ON public.special_days FOR ALL
  TO public
  USING (
    center_id = get_user_center_id(auth.uid())
    AND is_admin(auth.uid())
  )
  WITH CHECK (
    center_id = get_user_center_id(auth.uid())
    AND is_admin(auth.uid())
  );

-- Profesionales: solo sus propios special_days con scope='professional'.
-- En este proyecto profiles.id = auth.users.id, por lo que professional_id = auth.uid().
CREATE POLICY "Professionals manage own special days"
  ON public.special_days FOR ALL
  TO public
  USING (
    center_id = get_user_center_id(auth.uid())
    AND is_professional(auth.uid())
    AND scope = 'professional'
    AND professional_id = auth.uid()
  )
  WITH CHECK (
    center_id = get_user_center_id(auth.uid())
    AND is_professional(auth.uid())
    AND scope = 'professional'
    AND professional_id = auth.uid()
  );

CREATE POLICY "Public read special days for booking"
  ON public.special_days FOR SELECT
  TO anon
  USING (
    affects_public_booking = true
    AND center_id IN (
      SELECT id FROM public.centers
      WHERE public_booking_enabled = true OR portal_enabled = true
    )
  );

-- special_day_slots: se derivan del padre.
CREATE POLICY "View special day slots in center"
  ON public.special_day_slots FOR SELECT
  TO public
  USING (
    special_day_id IN (
      SELECT id FROM public.special_days
      WHERE center_id = get_user_center_id(auth.uid())
    )
  );

-- Admins: gestión total de slots cuyo padre está en su centro.
CREATE POLICY "Admins manage special day slots"
  ON public.special_day_slots FOR ALL
  TO public
  USING (
    special_day_id IN (
      SELECT id FROM public.special_days
      WHERE center_id = get_user_center_id(auth.uid())
        AND is_admin(auth.uid())
    )
  )
  WITH CHECK (
    special_day_id IN (
      SELECT id FROM public.special_days
      WHERE center_id = get_user_center_id(auth.uid())
        AND is_admin(auth.uid())
    )
  );

-- Profesionales: solo slots de sus propios special_days.
CREATE POLICY "Professionals manage own special day slots"
  ON public.special_day_slots FOR ALL
  TO public
  USING (
    special_day_id IN (
      SELECT id FROM public.special_days
      WHERE center_id = get_user_center_id(auth.uid())
        AND is_professional(auth.uid())
        AND scope = 'professional'
        AND professional_id = auth.uid()
    )
  )
  WITH CHECK (
    special_day_id IN (
      SELECT id FROM public.special_days
      WHERE center_id = get_user_center_id(auth.uid())
        AND is_professional(auth.uid())
        AND scope = 'professional'
        AND professional_id = auth.uid()
    )
  );

-- Realtime (idempotente: ignora si la tabla ya está en la publicación).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.special_days;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.special_day_slots;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

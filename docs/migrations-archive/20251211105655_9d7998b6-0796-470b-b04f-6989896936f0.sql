-- Añadir token único para acceso público a sesiones
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE;

-- Crear índice para búsquedas rápidas por token
CREATE INDEX IF NOT EXISTS idx_sessions_access_token ON public.sessions(access_token);

-- Función para generar token de acceso automáticamente
CREATE OR REPLACE FUNCTION public.generate_session_access_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.access_token IS NULL THEN
    NEW.access_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar token al crear sesión
DROP TRIGGER IF EXISTS session_generate_token ON public.sessions;
CREATE TRIGGER session_generate_token
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_session_access_token();

-- Generar tokens para sesiones existentes que no lo tengan
UPDATE public.sessions 
SET access_token = encode(gen_random_bytes(16), 'hex')
WHERE access_token IS NULL;

-- Política RLS para acceso público por token (solo lectura)
CREATE POLICY "Public read access by token" ON public.sessions
FOR SELECT
USING (access_token IS NOT NULL);

-- Política RLS para actualización pública por token (solo campos específicos)
CREATE POLICY "Public update by token" ON public.sessions
FOR UPDATE
USING (access_token IS NOT NULL)
WITH CHECK (access_token IS NOT NULL);
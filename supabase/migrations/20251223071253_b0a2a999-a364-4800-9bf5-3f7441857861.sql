-- PASO 2: Limpieza de Base de Datos - Eliminar sesiones bloqueadas importadas de Google
-- y duplicados existentes

-- Primero, eliminar TODAS las sesiones con status 'blocked' que tienen google_calendar_event_id
-- (estas son las importaciones erróneas del calendario personal)
DELETE FROM sessions 
WHERE status = 'blocked' 
AND google_calendar_event_id IS NOT NULL;

-- Eliminar duplicados de google_calendar_event_id manteniendo solo el registro más antiguo
DELETE FROM sessions a
USING sessions b
WHERE a.id > b.id 
AND a.google_calendar_event_id IS NOT NULL
AND b.google_calendar_event_id IS NOT NULL
AND a.google_calendar_event_id = b.google_calendar_event_id;

-- PASO 3: Crear índice único en google_calendar_event_id para prevenir duplicados futuros
-- Usamos un índice parcial que solo aplica cuando google_calendar_event_id no es NULL
CREATE UNIQUE INDEX IF NOT EXISTS sessions_google_calendar_event_id_unique 
ON sessions (google_calendar_event_id) 
WHERE google_calendar_event_id IS NOT NULL;
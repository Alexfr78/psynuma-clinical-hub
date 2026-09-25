-- La reserva pública y el portal guardaban solo el nombre del servicio
-- (session_type), sin session_type_id. Desde ahora lo guardan; aquí se rellenan
-- las citas antiguas donde el nombre identifica un único tipo del centro.
-- Solo se toca session_type_id: el precio de las citas existentes no cambia
-- (el trigger de precio resuelto actúa únicamente en INSERT).

UPDATE public.sessions s
   SET session_type_id = st.id
  FROM public.session_types st
 WHERE s.session_type_id IS NULL
   AND s.session_type IS NOT NULL
   AND st.center_id = s.center_id
   AND lower(st.name) = lower(s.session_type)
   AND (SELECT count(*) FROM public.session_types st2
         WHERE st2.center_id = s.center_id
           AND lower(st2.name) = lower(s.session_type)) = 1;

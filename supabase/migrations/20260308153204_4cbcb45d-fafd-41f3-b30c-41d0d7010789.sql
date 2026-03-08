
ALTER TABLE public.autoregistro_templates
ADD COLUMN patient_feedback_enabled boolean DEFAULT false;

-- Anon can read entries when feedback is enabled and token is valid
CREATE POLICY "Anon can read entries for feedback"
ON public.autoregistro_entries FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.autoregistro_links al
    JOIN public.autoregistro_templates at2 ON at2.id = al.template_id
    WHERE al.access_token = public.get_autoregistro_token()
    AND al.status = 'active'
    AND al.patient_id = autoregistro_entries.patient_id
    AND al.template_id = autoregistro_entries.template_id
    AND at2.patient_feedback_enabled = true
  )
);

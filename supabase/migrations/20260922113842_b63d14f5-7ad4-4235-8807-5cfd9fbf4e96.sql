BEGIN;
ALTER TABLE public.audio_ingestions DROP CONSTRAINT audio_ingestions_source_check;
ALTER TABLE public.audio_ingestions ADD CONSTRAINT audio_ingestions_source_check
  CHECK (source IN ('android_recorder', 'samsung_media_store', 'share_target', 'manual_upload', 'web_recorder'));

-- Existing center-scoped UPDATE privileges cover every column. Without these
-- restrictive policies an authenticated client could change source to bypass
-- the recorder consent gate, impersonate its owner, or change its state/path.
-- Other sources keep their existing policies; service_role still manages the
-- recorder exclusively through the authenticated edge functions.
CREATE POLICY "Web recorder mutations require backend" ON public.audio_ingestions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (source <> 'web_recorder')
  WITH CHECK (source <> 'web_recorder');

CREATE POLICY "Web recorder deletion requires backend" ON public.audio_ingestions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (source <> 'web_recorder');

-- INSERT has no permissive authenticated policy today. Keep the recorder gate
-- intact if another source gains such a policy in a future migration.
CREATE POLICY "Web recorder creation requires backend" ON public.audio_ingestions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (source <> 'web_recorder');
COMMIT;
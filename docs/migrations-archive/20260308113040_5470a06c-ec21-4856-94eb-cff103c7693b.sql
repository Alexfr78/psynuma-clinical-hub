CREATE POLICY "Users can delete own center entries"
ON public.autoregistro_entries
FOR DELETE
TO authenticated
USING (center_id = get_user_center_id(auth.uid()));
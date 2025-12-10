-- Allow authenticated users to create their FIRST center (when they have no center_id)
CREATE POLICY "Users can create their first center"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT center_id FROM public.profiles WHERE id = auth.uid()) IS NULL
);

-- Allow users to assign themselves initial roles (when they have no roles)
CREATE POLICY "Users can assign initial roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
);
-- Allow public read of patients when accessed via session token (limited fields through join)
CREATE POLICY "Public read patient via session token"
ON public.patients
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.patient_id = patients.id 
    AND sessions.access_token IS NOT NULL
  )
);

-- Allow public read of profiles when accessed via session token (limited fields through join)
CREATE POLICY "Public read professional via session token"
ON public.profiles
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.professional_id = profiles.id 
    AND sessions.access_token IS NOT NULL
  )
);

-- Allow public read of center_locations when accessed via session token (limited fields through join)
CREATE POLICY "Public read location via session token"
ON public.center_locations
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.location_id = center_locations.id 
    AND sessions.access_token IS NOT NULL
  )
);
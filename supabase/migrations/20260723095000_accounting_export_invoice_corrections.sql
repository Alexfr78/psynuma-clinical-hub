-- Accounting exports are available to center staff. Allow them to read the
-- F3 substitution references for invoices they can already access.

DROP POLICY IF EXISTS "Admins can view invoice substitutions"
  ON public.invoice_substitutions;
DROP POLICY IF EXISTS "Center staff can view invoice substitutions"
  ON public.invoice_substitutions;

CREATE POLICY "Center staff can view invoice substitutions"
  ON public.invoice_substitutions
  FOR SELECT
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.is_professional(auth.uid())
    )
  );

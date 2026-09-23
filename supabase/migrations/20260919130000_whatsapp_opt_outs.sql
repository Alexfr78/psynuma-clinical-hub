CREATE TABLE IF NOT EXISTS public.whatsapp_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  opted_in_at timestamptz,
  source text NOT NULL CHECK (source IN ('patient_reply', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_opt_outs_center_phone_key UNIQUE (center_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_opt_outs_center_phone
  ON public.whatsapp_opt_outs (center_id, phone);

ALTER TABLE public.whatsapp_opt_outs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access WhatsApp opt-outs" ON public.whatsapp_opt_outs;
CREATE POLICY "Service role full access WhatsApp opt-outs"
  ON public.whatsapp_opt_outs AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view WhatsApp opt-outs in their center" ON public.whatsapp_opt_outs;
CREATE POLICY "Users can view WhatsApp opt-outs in their center"
  ON public.whatsapp_opt_outs AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    center_id = get_user_center_id(auth.uid())
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

REVOKE ALL ON TABLE public.whatsapp_opt_outs FROM anon;
REVOKE ALL ON TABLE public.whatsapp_opt_outs FROM authenticated;
GRANT SELECT ON TABLE public.whatsapp_opt_outs TO authenticated;
GRANT ALL ON TABLE public.whatsapp_opt_outs TO service_role;

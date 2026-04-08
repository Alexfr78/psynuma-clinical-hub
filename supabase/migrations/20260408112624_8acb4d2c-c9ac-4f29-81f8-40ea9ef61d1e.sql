
-- TABLE 1: autoregistro_alert_rules
CREATE TABLE public.autoregistro_alert_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.autoregistro_templates(id) ON DELETE CASCADE,
  center_id         uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name              text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  conditions        jsonb NOT NULL DEFAULT '[]',
  logic_operator    text NOT NULL DEFAULT 'OR'
    CONSTRAINT chk_logic_operator CHECK (logic_operator IN ('AND', 'OR')),
  consecutive_count integer NOT NULL DEFAULT 1
    CONSTRAINT chk_consecutive_count CHECK (consecutive_count >= 1),
  severity          text NOT NULL DEFAULT 'warning'
    CONSTRAINT chk_severity CHECK (severity IN ('warning', 'critical')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autoregistro_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert rules of their center"
  ON public.autoregistro_alert_rules FOR SELECT TO authenticated
  USING (center_id = (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create alert rules for their center"
  ON public.autoregistro_alert_rules FOR INSERT TO authenticated
  WITH CHECK (center_id = (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update alert rules of their center"
  ON public.autoregistro_alert_rules FOR UPDATE TO authenticated
  USING (center_id = (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete alert rules of their center"
  ON public.autoregistro_alert_rules FOR DELETE TO authenticated
  USING (center_id = (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER update_autoregistro_alert_rules_updated_at
  BEFORE UPDATE ON public.autoregistro_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 2: autoregistro_alert_logs
CREATE TABLE public.autoregistro_alert_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              uuid NOT NULL REFERENCES public.autoregistro_entries(id) ON DELETE CASCADE,
  rule_id               uuid NOT NULL REFERENCES public.autoregistro_alert_rules(id) ON DELETE CASCADE,
  center_id             uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  fired_at              timestamptz NOT NULL DEFAULT now(),
  notification_method   text,
  success               boolean NOT NULL DEFAULT false,
  error_message         text,
  severity              text
);

ALTER TABLE public.autoregistro_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert logs of their center"
  ON public.autoregistro_alert_logs FOR SELECT TO authenticated
  USING (center_id = (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Service role can insert alert logs"
  ON public.autoregistro_alert_logs FOR INSERT TO service_role
  WITH CHECK (true);

-- Add frequency-based alert rule support to autoregistro_alert_rules
ALTER TABLE autoregistro_alert_rules
  ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'condition',
  ADD COLUMN IF NOT EXISTS frequency_threshold integer,
  ADD COLUMN IF NOT EXISTS frequency_window_hours integer,
  ADD COLUMN IF NOT EXISTS frequency_condition_field text,
  ADD COLUMN IF NOT EXISTS frequency_condition_operator text,
  ADD COLUMN IF NOT EXISTS frequency_condition_value text;

-- Add check constraint for rule_type
ALTER TABLE autoregistro_alert_rules
  ADD CONSTRAINT autoregistro_alert_rules_rule_type_check
  CHECK (rule_type IN ('condition', 'frequency'));

-- Ensure frequency rules have required fields
ALTER TABLE autoregistro_alert_rules
  ADD CONSTRAINT autoregistro_alert_rules_frequency_check
  CHECK (
    rule_type != 'frequency'
    OR (frequency_threshold IS NOT NULL AND frequency_window_hours IS NOT NULL)
  );

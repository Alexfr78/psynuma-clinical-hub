-- Drop the existing check constraint and add updated one that includes payment_reminder
ALTER TABLE communication_templates DROP CONSTRAINT IF EXISTS communication_templates_template_type_check;

ALTER TABLE communication_templates ADD CONSTRAINT communication_templates_template_type_check 
  CHECK (template_type IN ('notification', 'reminder', 'payment_reminder'));
-- Extend communication_templates.template_type with booking event types
-- split by audience (patient / professional).

ALTER TABLE communication_templates DROP CONSTRAINT IF EXISTS communication_templates_template_type_check;

ALTER TABLE communication_templates ADD CONSTRAINT communication_templates_template_type_check
  CHECK (template_type IN (
    'notification',
    'reminder',
    'payment_reminder',
    'booking_created_patient',
    'booking_created_professional',
    'booking_rescheduled_patient',
    'booking_rescheduled_professional',
    'booking_cancelled_patient',
    'booking_cancelled_professional'
  ));

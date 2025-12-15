-- Add email_subject and email_footer columns to communication_templates
ALTER TABLE communication_templates 
ADD COLUMN email_subject text,
ADD COLUMN email_footer text;
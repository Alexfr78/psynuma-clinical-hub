-- Create communication_templates table
CREATE TABLE public.communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  template_type TEXT NOT NULL CHECK (template_type IN ('notification', 'reminder')),
  
  -- Para Email: múltiples secciones
  email_initial_text TEXT,
  email_confirmation_text TEXT,
  email_videocall_text TEXT,
  email_payment_text TEXT,
  
  -- Para SMS: un solo campo
  sms_message TEXT,
  
  -- Para WhatsApp: mensaje único
  whatsapp_message TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(center_id, channel, template_type)
);

-- Enable RLS
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "View communication templates in center"
ON public.communication_templates
FOR SELECT
USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage communication templates in center"
ON public.communication_templates
FOR ALL
USING (
  center_id = get_user_center_id(auth.uid()) 
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- Trigger for updated_at
CREATE TRIGGER update_communication_templates_updated_at
BEFORE UPDATE ON public.communication_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
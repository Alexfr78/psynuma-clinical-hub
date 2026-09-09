-- Create bono_templates table for predefined session packages
CREATE TABLE public.bono_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  total_sessions integer NOT NULL,
  price_per_session numeric NOT NULL,
  total_price numeric NOT NULL,
  validity_days integer, -- days of validity from purchase date
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bono_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "View bono templates in center"
ON public.bono_templates
FOR SELECT
USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage bono templates"
ON public.bono_templates
FOR ALL
USING (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())));

-- Add trigger for updated_at
CREATE TRIGGER update_bono_templates_updated_at
BEFORE UPDATE ON public.bono_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
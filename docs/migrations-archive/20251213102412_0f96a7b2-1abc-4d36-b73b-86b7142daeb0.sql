-- Tabla professional_integrations: configuración de integraciones por profesional
CREATE TABLE public.professional_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- WhatsApp Business (por profesional)
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_send_method TEXT DEFAULT 'web' CHECK (whatsapp_send_method IN ('web', 'api')),
  whatsapp_access_token TEXT,
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  
  -- Video Calls
  zoom_enabled BOOLEAN DEFAULT false,
  google_meet_enabled BOOLEAN DEFAULT false,
  default_video_provider TEXT DEFAULT 'none' CHECK (default_video_provider IN ('none', 'zoom', 'google_meet')),
  
  -- Google Calendar
  google_calendar_enabled BOOLEAN DEFAULT false,
  google_calendar_sync_mode TEXT DEFAULT 'one_way' CHECK (google_calendar_sync_mode IN ('one_way', 'two_way')),
  
  -- Stripe
  stripe_enabled BOOLEAN DEFAULT false,
  stripe_payment_mode TEXT DEFAULT 'post_pay' CHECK (stripe_payment_mode IN ('required_now', 'post_pay', 'scheduled_before')),
  stripe_scheduled_hours_before INTEGER DEFAULT 24,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_professional_integrations_updated_at
  BEFORE UPDATE ON public.professional_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS para professional_integrations
ALTER TABLE public.professional_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals manage own integrations"
ON public.professional_integrations FOR ALL
USING (professional_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "View integrations in center"
ON public.professional_integrations FOR SELECT
USING (professional_id IN (
  SELECT id FROM public.profiles WHERE center_id = public.get_user_center_id(auth.uid())
));

-- Tabla oauth_connections: tokens OAuth por profesional
CREATE TABLE public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'zoom', 'stripe')),
  
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  provider_account_id TEXT,
  
  -- Stripe Connect
  stripe_account_id TEXT,
  stripe_account_status TEXT CHECK (stripe_account_status IN ('pending', 'active', 'restricted', 'disabled')),
  
  -- Google Calendar
  google_calendar_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(professional_id, provider)
);

-- Trigger para updated_at
CREATE TRIGGER update_oauth_connections_updated_at
  BEFORE UPDATE ON public.oauth_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS para oauth_connections
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals manage own oauth"
ON public.oauth_connections FOR ALL
USING (professional_id = auth.uid() OR public.is_admin(auth.uid()));

-- Campos adicionales en sessions para tracking de integraciones
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS video_provider TEXT 
  CHECK (video_provider IN ('none', 'zoom', 'google_meet'));
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS stripe_payment_status TEXT 
  CHECK (stripe_payment_status IN ('not_required', 'pending', 'paid', 'failed', 'refunded'));
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS stripe_payment_mode TEXT 
  CHECK (stripe_payment_mode IN ('required_now', 'post_pay', 'scheduled_before'));
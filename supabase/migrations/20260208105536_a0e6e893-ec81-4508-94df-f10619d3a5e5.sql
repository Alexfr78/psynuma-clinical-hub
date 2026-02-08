-- ============================================
-- WASENDER API INTEGRATION - DATABASE SCHEMA
-- ============================================

-- Table: WhatsApp Sessions (conexiones de usuarios)
CREATE TABLE public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wasender_session_id TEXT, -- ID de sesión en WasenderAPI
  name TEXT NOT NULL DEFAULT 'Principal',
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'need_scan', 'connected', 'expired')),
  phone_number TEXT, -- Número conectado
  qr_code TEXT, -- QR actual para escanear
  qr_expires_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  webhook_secret TEXT, -- Para verificar webhooks entrantes
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: WhatsApp Messages (historial de mensajes)
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  phone TEXT NOT NULL, -- Número destino
  content TEXT, -- Contenido del mensaje
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'template')),
  direction TEXT NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('incoming', 'outgoing')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'played')),
  wasender_message_id TEXT, -- ID del mensaje en WasenderAPI
  media_url TEXT, -- URL de media si aplica
  caption TEXT, -- Caption para imágenes/videos
  template_name TEXT, -- Nombre de plantilla si aplica
  template_variables JSONB, -- Variables de plantilla
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB, -- Datos adicionales (session_id, patient_id, etc.)
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: WhatsApp Queue (cola de mensajes con rate limiting)
CREATE TABLE public.whatsapp_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0, -- Mayor = más prioridad
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes para rendimiento
CREATE INDEX idx_whatsapp_sessions_center ON public.whatsapp_sessions(center_id);
CREATE INDEX idx_whatsapp_sessions_status ON public.whatsapp_sessions(status);
CREATE INDEX idx_whatsapp_messages_center ON public.whatsapp_messages(center_id);
CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);
CREATE INDEX idx_whatsapp_queue_status_scheduled ON public.whatsapp_queue(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_whatsapp_queue_center ON public.whatsapp_queue(center_id);

-- Enable RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whatsapp_sessions
CREATE POLICY "Users can view their center's sessions"
  ON public.whatsapp_sessions FOR SELECT
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create sessions for their center"
  ON public.whatsapp_sessions FOR INSERT
  WITH CHECK (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their center's sessions"
  ON public.whatsapp_sessions FOR UPDATE
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their center's sessions"
  ON public.whatsapp_sessions FOR DELETE
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

-- RLS Policies for whatsapp_messages
CREATE POLICY "Users can view their center's messages"
  ON public.whatsapp_messages FOR SELECT
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create messages for their center"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their center's messages"
  ON public.whatsapp_messages FOR UPDATE
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

-- RLS Policies for whatsapp_queue
CREATE POLICY "Users can view their center's queue"
  ON public.whatsapp_queue FOR SELECT
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage their center's queue"
  ON public.whatsapp_queue FOR ALL
  USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "Service role full access sessions"
  ON public.whatsapp_sessions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access messages"
  ON public.whatsapp_messages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access queue"
  ON public.whatsapp_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger para updated_at
CREATE TRIGGER update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add wasender settings to centers table
ALTER TABLE public.centers 
  ADD COLUMN IF NOT EXISTS wasender_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wasender_auto_reminders BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wasender_reminder_24h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wasender_reminder_2h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wasender_confirm_booking BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wasender_notify_cancellation BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wasender_emergency_stop BOOLEAN DEFAULT false;
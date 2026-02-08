-- Add missing columns to whatsapp_messages table
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_patient_id 
ON public.whatsapp_messages(patient_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session_id 
ON public.whatsapp_messages(session_id);
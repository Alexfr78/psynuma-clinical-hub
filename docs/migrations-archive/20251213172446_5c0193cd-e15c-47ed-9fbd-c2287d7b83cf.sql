-- =============================================
-- Configuración global de pagos en centers
-- =============================================

-- Modo de pago predeterminado para nuevas sesiones
ALTER TABLE centers ADD COLUMN IF NOT EXISTS default_payment_mode text DEFAULT 'in_session';
-- Valores: 'required_now', 'in_session', 'post_session', 'scheduled_before'

-- Horas antes para envío programado (si default_payment_mode = 'scheduled_before')
ALTER TABLE centers ADD COLUMN IF NOT EXISTS default_scheduled_hours_before integer DEFAULT 24;

-- Recordatorios de pago pendiente
ALTER TABLE centers ADD COLUMN IF NOT EXISTS payment_reminder_enabled boolean DEFAULT true;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS payment_reminder_hours_after integer DEFAULT 24;
-- Número de recordatorios máximos
ALTER TABLE centers ADD COLUMN IF NOT EXISTS payment_reminder_max_count integer DEFAULT 3;
-- Intervalo entre recordatorios (en horas)
ALTER TABLE centers ADD COLUMN IF NOT EXISTS payment_reminder_interval_hours integer DEFAULT 48;

-- =============================================
-- Configuración de pago por sesión
-- =============================================

-- Modo de pago específico de la sesión (si es NULL, usa el predeterminado del centro)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT NULL;
-- Valores: 'required_now', 'in_session', 'post_session', 'scheduled_before', NULL (usar default)

-- Estado del pago de la sesión
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
-- Valores: 'pending', 'paid', 'overdue', 'reminder_sent'

-- Contador de recordatorios enviados
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_reminder_count integer DEFAULT 0;

-- Último recordatorio enviado
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_payment_reminder_at timestamptz DEFAULT NULL;
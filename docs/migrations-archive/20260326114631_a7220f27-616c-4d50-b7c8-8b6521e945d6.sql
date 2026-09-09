ALTER TABLE centers ADD COLUMN IF NOT EXISTS ai_temperature real DEFAULT 0.3;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS ai_analysis_mode text DEFAULT 'layered';
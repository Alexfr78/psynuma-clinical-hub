-- Mirrors invoices.drive_file_id/drive_url: lets an expense receipt be
-- backed up to the center's Google Drive, same per-center connection used
-- for invoices (center_drive_connections).
ALTER TABLE public.expenses
  ADD COLUMN drive_file_id text,
  ADD COLUMN drive_url text;

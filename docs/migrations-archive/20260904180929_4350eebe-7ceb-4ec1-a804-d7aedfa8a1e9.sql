-- Explicit purpose marker for notifications, replacing the fragile
-- subject-string-match used by send-notification's consent gate.
--
-- Why `purpose` and not `category`: the existing code comments (see
-- supabase/functions/send-notification/index.ts) already describe every
-- notification kind in terms of its legal basis under data protection law
-- (contract performance, legitimate interest, explicit consent...). `purpose`
-- names that concept directly, and lines up with the `ConsentPurpose` type
-- already used across the consent system (recording / ai_processing /
-- report_generation / channel_whatsapp / channel_email in
-- src/lib/consent-verification.ts and supabase/functions/_shared/consent.ts).
--
-- Only one value is defined for now: 'clinical_report', for the three
-- call sites that push out AI-generated clinical/patient session summaries
-- (useTranscriptionAnalysis.tsx, PatientAIReports.tsx,
-- SessionDetailDrawer.tsx). Every other notification (appointment
-- confirmations/reminders, invoices, payment reminders, internal alerts...)
-- is left with purpose = NULL, meaning "no consent-purpose gate applies;
-- legal basis is contract performance / legitimate interest as usual". NULL
-- is intentionally allowed so every pre-existing row keeps working without
-- backfill, and so future notification types don't need a value unless they
-- also need a consent gate.
--
-- The CHECK constraint enumerates known values the same way this codebase
-- already does for other lifecycle/category text columns (see e.g.
-- notifications.status, communication_templates.channel,
-- invoice_series.series_type). Extend the IN-list here (in a follow-up
-- migration) if a new gated purpose is ever introduced — do NOT repurpose
-- 'clinical_report' for anything else.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS purpose text
    CHECK (purpose IN ('clinical_report'));

COMMENT ON COLUMN public.notifications.purpose IS
  'Explicit delivery purpose for consent-gated notification kinds. NULL for the majority of notifications (reminders, invoices, payment notices...), whose legal basis does not require a per-purpose consent check. ''clinical_report'' marks AI-generated clinical/patient session summary deliveries, which send-notification refuses to send without an explicit channel_whatsapp / channel_email consent grant (see checkPatientConsent in supabase/functions/_shared/consent.ts). Set at insert time by the three call sites that create these notifications: src/hooks/useTranscriptionAnalysis.tsx, src/components/patients/tabs/PatientAIReports.tsx, src/components/agenda/SessionDetailDrawer.tsx.';

-- No RLS policy changes needed: notifications is already scoped end-to-end
-- by center_id under the existing "View notifications in center" / "Manage
-- notifications" policies (see supabase/migrations/…_aa013973…notifications
-- initial table migration), which apply to all columns including this one.
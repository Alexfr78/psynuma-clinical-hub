# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:8080
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
npm run test        # Run vitest test suite once
npm run test:watch  # Run vitest in watch mode
```

A small vitest suite exists in `src/lib/__tests__/` (availability, Google sync safety, special-days adapter). Most business logic is still untested — don't assume coverage beyond those files.

## Environment Variables

The frontend requires a `.env` file with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Supabase secrets required for edge functions:

| Secret | Description |
|---|---|
| `RESEND_API_KEY` | Resend email service |
| `RESEND_FROM_EMAIL` | Sender email address |
| `APP_BASE_URL` | Base URL (e.g. `https://yourdomain.com`) |
| `CRON_SECRET` | Shared secret for cron-triggered edge functions |
| `WASENDER_WEBHOOK_SECRET` | WasenderAPI webhook secret |
| `CERTIFICATE_ENCRYPTION_KEY` | 32+ char key for encrypting stored certificates |

## Architecture

### What It Is
**Psycma** — a clinical management SaaS platform for psychologists and therapists (Spanish-language UI). Multi-tenant: each workspace is a `center` record; all data is scoped to a center.

### Frontend Stack
- **React 19 + TypeScript + Vite** — dev server on port 8080, PWA enabled via `vite-plugin-pwa`
- **Tailwind CSS + shadcn/ui** — all UI primitives in `src/components/ui/`, sourced from Radix UI
- **React Router v6** — routes defined in `src/App.tsx` (not lazy-loaded)
- **TanStack Query v5** — `QueryClientProvider` wraps the app; most data fetching goes through custom hooks using `useQuery`/`useMutation`
- **Supabase JS client** — database, auth, storage, and edge function calls via `src/integrations/supabase/client.ts`

### Path Alias
`@/` maps to `src/`. Use `@/components/...`, `@/hooks/...`, etc. in all imports.

### Auth & Roles
Auth is managed by `AuthProvider` in `src/hooks/useAuth.tsx`. It exposes `user`, `profile`, `roles`, `isAdmin`, `isProfessional`, `isPatient`, and `hasCenter`.

Roles are stored in the `user_roles` table (`user_id` + `role`). Three roles: `admin`, `professional`, `patient`.

MFA is supported — `needsMfaVerification` state gates post-login access until a TOTP code is verified.

`ProtectedRoute` in `src/components/ProtectedRoute.tsx` wraps all authenticated routes and optionally enforces `requiredRoles`.

### First-Login Flow
After signup, if `profile.center_id` is null, `AppLayout` renders `CenterSetupWizard` instead of the normal app. This wizard creates the center and assigns the user as admin.

### Page Routes (`src/pages/`)

**Public (no auth):**
- `/` — marketing landing page (`PublicLanding`)
- `/auth` — login/signup
- `/instalar` — PWA install instructions (`Install`)
- `/cita/:token` — session management (patient self-service reschedule/cancel)
- `/consentimiento/:token` — consent signature
- `/evaluacion/:token` — assessment form
- `/emo/:token` — EMO assessment
- `/factura/:token` — invoice viewer
- `/informe/:token` — patient-facing session report (tokenized snapshot, expires)
- `/enlace/:code` — public short-link redirect (`resolve-public-short-link`)
- `/portal/:slug` — patient portal login
- `/portal/:slug/dashboard` — patient portal dashboard
- `/book/:centerSlug` / `/reservas/:centerSlug` — public booking
- `/book/:centerSlug/manage` / `/reservas/:centerSlug/manage` — public booking self-management (`PublicBookingManage`)
- `/pagar/:token` — debt payment (Stripe)
- `/pago-exitoso` — Stripe payment success redirect
- `/derivaciones/:centerSlug/registro` — referral self-registration
- `/registro/:token` — patient self-registration (autoregistro)

**Protected (therapist/admin):**
- `/dashboard`, `/agenda`, `/pacientes`, `/pacientes/:id`
- `/sesiones`, `/bonos`, `/facturas`, `/cobros`, `/gastos`
- `/consentimientos`, `/evaluaciones`, `/evaluaciones/:assessmentId/resultados`, `/autorregistros`
- `/grabaciones` — Plaud recording review tray (`PlaudReview`)
- `/compartir-audio` — Android share-target landing for shared audio (`ShareAudio`)
- `/notificaciones`, `/configuracion`
- Admin-only (`requiredRoles={['admin']}`): `/profesionales`, `/derivaciones`, `/auditoria`, `/auditoria-clinica`, `/solicitudes`

### Database Schema (Supabase)
Types are auto-generated in `src/integrations/supabase/types.ts`. Key tables (there are also many `verify_*_token*`, `get_*`, and lock/debounce RPC functions backing tokenized public routes — see `types.ts` for the full list):
- **`centers`** / **`centers_public`** — one per tenant; all data is scoped here
- **`profiles`** / **`profiles_public`** — one per user; has `center_id`, `first_name`, `last_name`, `specialty`, `is_active`
- **`user_roles`** — `user_id` + `role` (`admin` | `professional` | `patient`)
- **`patients`** / **`patients_public`** — `center_id`, contact/demographic info, `status`; the `_public` view exposes only what public routes need
- **`calendar_events`** / **`recurring_series`** — therapy sessions/appointments; recurrence support
- **`sessions`** — billable session records derived from calendar events
- **`session_types`** — configurable session types per center (duration, price, color)
- **`center_locations`** / **`schedule_exceptions`** / **`special_days`** / **`special_day_slots`** / **`availability`** — agenda/scheduling configuration
- **`bonos`** / **`bono_templates`** / **`bono_items`** — therapy packages (session bundles) per patient
- **`tariff_plans`** / **`tariff_plan_items`** — pricing plans
- **`invoices`** / **`invoice_items`** / **`invoice_series`** — billing; supports Spanish Verifactu e-invoicing
- **`invoice_substitutions`** / **`invoice_correction_operations`** — rectificative invoice lineage
- **`verifactu_records`** / **`verifactu_events`** / **`verifactu_chain_status`** — Verifactu chain-of-custody records
- **`payments`** / **`debts`** / **`billable_events`** — payment tracking and what is billable
- **`patient_payment_methods`** / **`stripe_webhook_events`** — saved cards (SetupIntent) and Stripe event dedup
- **`patient_custom_prices`** / **`patient_custom_price_history`** / **`patient_tariff_plan_assignments`** — per-patient pricing
- **`cancellation_charges`** / **`cancellation_policy_versions`** — cancellation fee handling
- **`expenses`** / **`expense_categories`** / **`expense_recurring_templates`** / **`suppliers`** — expenses module (receipts, recurrence, suppliers)
- **`professional_compensation_agreements`** — per-professional compensation (fixed/variable) driving payouts
- **`consents`** / **`consent_templates`** / **`consent_signatures`** — digital consent management with signature
- **`assessments`** / **`assessment_templates`** / **`assessment_responses`** — psychological assessments (DES, MMPI-2-RF, PAI, EMO)
- **`emotional_records`** — DES/emotional tracking data
- **`autoregistro_templates`** / **`autoregistro_links`** / **`autoregistro_entries`** / **`autoregistro_alert_rules`** / **`autoregistro_alert_logs`** — patient self-monitoring records + alerting
- **`notifications`** / **`communication_templates`** — in-app + email/WhatsApp notification queue and templates
- **`whatsapp_messages`** / **`whatsapp_queue`** / **`whatsapp_sessions`** — WasenderAPI WhatsApp state
- **`email_queue_dispatch`** / **`email_send_log`** / **`email_send_state`** / **`email_unsubscribe_tokens`** / **`suppressed_emails`** — transactional email pipeline
- **`professional_integrations`** / **`oauth_connections`** (+ **`oauth_connections_safe`**, the token-free view) / **`google_calendar_channels`** / **`google_sync_locks`** / **`google_sync_debounce`** / **`google_session_sync_state`** — per-professional OAuth integration state (Google/Zoom/Stripe)
- **`center_drive_connections`** — per-center Google Drive connection for document archiving
- **`center_plaud_connections`** / **`plaud_oauth_states`** / **`plaud_recordings`** — Plaud recorder integration and its review tray (ingest currently disabled)
- **`ai_document_types`** / **`ai_document_defaults`** / **`ai_prompt_versions`** / **`ai_generated_documents`** — AI document templates, per-center defaults, versioned prompts and generated output
- **`integration_errors`** — integration failure log surfaced in Settings
- **`audit_logs`** / **`audit_log`** — system audit trail
- **`referral_partners`** / **`referral_partner_requests`** / **`referral_specialties`** — patient referrals from external sources
- **`portal_centers`** / **`portal_intake_requests`** — patient portal-facing views
- **`patient_portal_accounts`** / **`patient_portal_otp_codes`** / **`patient_magic_links`** — portal credentials, OTP and magic-link access
- **`patient_report_links`** / **`public_short_links`** — tokenized patient report snapshots and public short links
- **`location_schedules`** — per-location working hours
- **`app_versions`** / **`app_change_log`** — in-app version/changelog management (Settings → Sistema)
- **`rate_limit_log`** — abuse-prevention rate limiting on public endpoints

### Edge Functions (`supabase/functions/`, Deno runtime)
95 edge functions. Key groups:

**Billing / Verifactu (Spanish e-invoicing):**
`seal-invoice-verifactu`, `sign-invoice-verifactu`, `consulta-registro-verifactu`, `retry-pending-verifactu`, `export-verifactu-records`, `cancel-registro-facturacion`, `encrypt-certificate`

**Invoicing / debts (non-Verifactu):**
`generate-pending-debts`, `recompute-patient-statuses`, `send-invoice-notification`, `fix-invoice-type`

**Expenses and professional payouts:**
`extract-expense-receipt-data` (multimodal AI receipt reading), `generate-recurring-expenses`, `upload-expense-receipt-to-drive`, `generate-professional-payments`

**Assessments:**
`submit-assessment-response`

**Payments (Stripe):**
`create-stripe-checkout`, `create-bono-checkout`, `create-debt-payment-checkout`, `stripe-webhook`, `create-stripe-connect-link`, `stripe-connect-callback`, `refresh-stripe-account-status`, `process-advance-payment-deadlines`, `create-setup-intent`, `charge-cancellation`

**Notifications:**
`send-notification`, `send-session-reminders`, `send-payment-reminders`, `send-payment-reminder`, `process-email-queue`, `auth-email-hook`

**WhatsApp (WasenderAPI + Meta):**
`wasender-send-message`, `wasender-send-reminders`, `wasender-webhook`, `wasender-process-queue`, `wasender-connect`, `wasender-get-session`, `whatsapp-meta-webhook`

**Google Drive (document archiving):**
`google-drive-connection`, `google-drive-oauth-callback`, `refresh-google-drive-tokens`, `upload-invoice-to-drive`

**Plaud (recorder integration — ingest disabled, see `center_plaud_connections.enabled`):**
`plaud-connection`, `plaud-oauth-start`, `plaud-oauth-callback`, `refresh-plaud-tokens`, `sync-plaud-recordings`, `cleanup-plaud-transcripts`

**Google Calendar integration:**
`create-google-calendar-event`, `update-google-calendar-event`, `cleanup-google-events`, `sync-google-calendar`, `setup-google-calendar-watch`, `google-calendar-webhook`, `renew-google-calendar-watches`, `oauth-google-callback`, `list-google-calendars`, `backfill-google-calendar-colors`, `get-google-sync-diagnostics`, `stop-google-channel`, `save-oauth-credentials`

**Zoom:**
`create-zoom-meeting`, `update-zoom-meeting`, `delete-zoom-meeting`, `renew-zoom-tokens`, `oauth-zoom-callback`

**Session requests:**
`approve-session-request`

**Autoregistro alerts:**
`check-autoregistro-alerts`

**AI / Assessments:**
`analyze-session-transcription`, `transcribe-session-audio`, `interpret-emo-results`, `interpret-mmpi2rf-results`, `interpret-pai-results`, `analyze-des-examples`

**Patient-facing (no JWT — they validate their own token/HMAC/OTP instead):**
`patient-portal-auth`, `patient-portal-otp`, `patient-portal-account`, `patient-portal-sessions`, `patient-portal-invoices`, `patient-portal-documents`, `patient-portal-payment-methods`, `patient-portal-register`, `public-booking`, `public-session-reschedule`, `public-referral-register`, `submit-consent-signature`, `update-consent-emergency-contact`, `view-patient-report`, `create-public-session-short-link`, `resolve-public-short-link`, `generate-consent-pdf`, `generate-assessment-pdf`, `generate-invoice-pdf`

**Team management:**
`invite-professional`

**Shared utilities** are in `supabase/functions/_shared/`.

### Settings Architecture
`src/pages/Settings.tsx` renders a grouped section navigator (dropdown/list, not tabs) driven by a flat config array of `{ id, label, icon, parent, subgroup? }`. Top-level groups (`parent`):
- **Mi Centro** — center info, locations, agenda config, non-working days, special days, session types
- **Portal de Contactos** — portal config, informed consents
- **Pagos y Facturación** — tariff plans, payment methods, cancellation policy, fiscal data, invoice customization/series/automation, and a **Verifactu (AEAT)** subgroup (certificate, responsible declaration, export)
- **Comunicaciones** — subgroups for appointment events (confirmations/reminders), per-channel templates (email/WhatsApp/SMS), payment reminders, and internal professional alerts
- **Conexiones Externas** — connection status, Email (Resend), WhatsApp, Google Calendar/Meet, Zoom, Stripe, advanced/OAuth credentials, AI
- **Seguridad** — 2FA
- **Sistema** — version management

Sub-components live in `src/components/settings/` (flat files plus `communications/`, `integrations/`, `versions/` subfolders).

### Key Utility Files
- `src/lib/utils.ts` — `cn()` (Tailwind class merging)
- `src/lib/sanitize.ts` — HTML sanitization
- `src/lib/nif-validation.ts` — Spanish NIF/NIE validation
- `src/lib/recurrence-utils.ts` / `src/types/recurring.ts` — recurring calendar event logic
- `src/lib/verifactu-validation.ts` / `src/lib/invoice-immutability.ts` / `src/lib/invoiceDocumentType.ts` — Spanish e-invoicing validation and invoice rules
- `src/lib/whatsapp.ts` — WhatsApp message formatting
- `src/lib/availability-core.ts` / `src/lib/conflicts.ts` / `src/lib/calculateSessionPositions.ts` — agenda availability and overlap/layout logic (has test coverage in `src/lib/__tests__/`)
- `src/lib/schedule-exceptions.ts` / `src/lib/special-days.ts` / `src/lib/special-days-helpers.ts` — non-working day and special-day rules
- `src/lib/reschedule-helpers.ts` / `src/lib/payment-mode.ts` / `src/lib/location-defaults.ts` — session rescheduling, payment mode, and default location logic
- `src/lib/assessment-utils.ts` — psychological assessment scoring/formatting helpers
- `src/lib/autoregistro-fields.ts` / `src/lib/autoregistro-field-display.ts` / `src/lib/autoregistro-format.ts` — patient self-monitoring field schema and rendering
- `src/lib/zoom-sync.ts` — Zoom meeting sync helpers
- `src/lib/defaultPrompts.ts` — default AI prompts for assessment interpretation/transcription analysis
- `src/lib/ai-documents.ts` / `src/lib/ai-documents-db.ts` / `src/lib/ai-models.ts` — AI document sections/markdown, persistence, and the model catalogue per provider
- `src/lib/consent-verification.ts` / `src/lib/consent-cascade.ts` / `src/lib/consent-checkboxes.ts` / `src/lib/consent-acceptance.ts` / `src/lib/consent-block-messages.ts` — purpose-scoped consent (`recording`, `ai_processing`, `report_generation`, `channel_whatsapp`, `channel_email`). Mirrors `supabase/functions/_shared/consent.ts` — keep both in sync
- `src/lib/plaud-matching.ts` / `src/lib/plaud-segmentation.ts` — matching a Plaud recording to a session and detecting multi-session/overlap risk
- `src/lib/shared-audio.ts` — reads audio delivered by the Android share target (see `public/share-target-sw.js`)
- `src/lib/edge-function-error.ts` — extracts the real reason from a failed `functions.invoke` (supabase-js hides the response body)
- `src/lib/expense-recurrence.ts` / `src/lib/expense-compensation.ts` — recurring expenses and professional compensation maths
- `src/lib/payment-status.ts` / `src/lib/payment-refunds.ts` / `src/lib/session-payment-link.ts` — payment state, refunds and per-session payment links
- `src/lib/invoice-series.ts` / `src/lib/complete-invoice-requirements.ts` / `src/lib/publicInvoiceRecipient.ts` — series numbering and complete-invoice requirements
- `src/lib/patient-report-links.ts` / `src/lib/public-base-url.ts` — tokenized patient report links and public URL building
- `src/lib/export/` — data export helpers (e.g. Verifactu records)

### Data Fetching Pattern
Each feature area has its own hooks in `src/hooks/` (e.g., `usePatients`, `useBonos`, `useInvoices`). Hooks use TanStack Query for caching and mutations. Direct Supabase calls (not going through hooks) should be avoided in page components.

## Reparto con Codex

El plugin de Codex está instalado. El trabajo se reparte así.

Te quedas tú (Claude):
- Entender el problema y preguntar lo que falte.
- Planear los pasos antes de tocar archivos.
- Decidir la arquitectura y los límites de cada cambio.
- Revisar todo lo que vuelva de Codex.

Se le pasa a Codex, con el subagente codex-rescue y sin esperar a que
te lo pida:
- Construcción repetitiva y larga.
- Refactors grandes que tocan muchos archivos.
- Errores atorados que ya se intentaron una vez.

Reglas fijas:
- Nada de lo que vuelve de Codex se da por bueno sin revisar.
- Si Codex falla dos veces en la misma tarea, la tarea regresa a ti.
- Delegar no es desentenderse: dime qué pediste y qué volvió.

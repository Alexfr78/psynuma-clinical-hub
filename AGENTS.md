# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- `/sesiones`, `/bonos`, `/facturas`, `/cobros`
- `/consentimientos`, `/evaluaciones`, `/evaluaciones/:assessmentId/resultados`, `/autorregistros`
- `/notificaciones`, `/configuracion`
- Admin-only (`requiredRoles={['admin']}`): `/profesionales`, `/derivaciones`, `/auditoria`, `/auditoria-clinica`, `/solicitudes`

### Database Schema (Supabase)
Types are auto-generated in `src/integrations/supabase/types.ts`. Key tables (there are also many `verify_*_token*`, `get_*`, and lock/debounce RPC functions backing tokenized public routes — see `types.ts` for the full list):
- **`centers`** / **`centers_public`** — one per tenant; all data is scoped here
- **`profiles`** / **`profiles_public`** — one per user; has `center_id`, `first_name`, `last_name`, `specialty`, `is_active`
- **`user_roles`** — `user_id` + `role` (`admin` | `professional` | `patient`)
- **`patients`** — `center_id`, contact/demographic info, `status`
- **`calendar_events`** / **`recurring_series`** — therapy sessions/appointments; recurrence support
- **`sessions`** — billable session records derived from calendar events
- **`session_types`** — configurable session types per center (duration, price, color)
- **`center_locations`** / **`schedule_exceptions`** / **`special_days`** / **`special_day_slots`** / **`availability`** — agenda/scheduling configuration
- **`bonos`** / **`bono_templates`** / **`bono_items`** — therapy packages (session bundles) per patient
- **`tariff_plans`** / **`tariff_plan_items`** — pricing plans
- **`invoices`** / **`invoice_items`** / **`invoice_series`** — billing; supports Spanish Verifactu e-invoicing
- **`verifactu_records`** / **`verifactu_events`** / **`verifactu_chain_status`** — Verifactu chain-of-custody records
- **`payments`** / **`debts`** — payment tracking
- **`cancellation_charges`** / **`cancellation_policy_versions`** — cancellation fee handling
- **`consents`** / **`consent_templates`** / **`consent_signatures`** — digital consent management with signature
- **`assessments`** / **`assessment_templates`** / **`assessment_responses`** — psychological assessments (DES, MMPI-2-RF, PAI, EMO)
- **`emotional_records`** — DES/emotional tracking data
- **`autoregistro_templates`** / **`autoregistro_links`** / **`autoregistro_entries`** / **`autoregistro_alert_rules`** / **`autoregistro_alert_logs`** — patient self-monitoring records + alerting
- **`notifications`** / **`communication_templates`** — in-app + email/WhatsApp notification queue and templates
- **`whatsapp_messages`** / **`whatsapp_queue`** / **`whatsapp_sessions`** — WasenderAPI WhatsApp state
- **`email_queue_dispatch`** / **`email_send_log`** / **`email_send_state`** / **`email_unsubscribe_tokens`** / **`suppressed_emails`** — transactional email pipeline
- **`professional_integrations`** / **`google_calendar_channels`** / **`google_sync_locks`** / **`google_sync_debounce`** — per-professional OAuth integration state (Google/Zoom/Stripe)
- **`integration_errors`** — integration failure log surfaced in Settings
- **`audit_logs`** / **`audit_log`** — system audit trail
- **`referral_partners`** / **`referral_partner_requests`** / **`referral_specialties`** — patient referrals from external sources
- **`portal_centers`** / **`portal_intake_requests`** — patient portal-facing views
- **`app_versions`** / **`app_change_log`** — in-app version/changelog management (Settings → Sistema)
- **`rate_limit_log`** — abuse-prevention rate limiting on public endpoints

### Edge Functions (`supabase/functions/`, Deno runtime)
69 edge functions. Key groups:

**Billing / Verifactu (Spanish e-invoicing):**
`seal-invoice-verifactu`, `sign-invoice-verifactu`, `consulta-registro-verifactu`, `retry-pending-verifactu`, `export-verifactu-records`, `cancel-registro-facturacion`, `encrypt-certificate`

**Invoicing / debts (non-Verifactu):**
`generate-pending-debts`, `recompute-patient-statuses`, `send-invoice-notification`

**Assessments:**
`submit-assessment-response`

**Payments (Stripe):**
`create-stripe-checkout`, `create-bono-checkout`, `create-debt-payment-checkout`, `stripe-webhook`, `create-stripe-connect-link`, `stripe-connect-callback`, `refresh-stripe-account-status`, `process-advance-payment-deadlines`

**Notifications:**
`send-notification`, `send-session-reminders`, `send-payment-reminders`, `send-payment-reminder`, `process-email-queue`, `auth-email-hook`

**WhatsApp (WasenderAPI):**
`wasender-send-message`, `wasender-send-reminders`, `wasender-webhook`, `wasender-process-queue`, `wasender-connect`, `wasender-get-session`

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

**Patient-facing (no JWT):**
`patient-portal-auth`, `patient-portal-sessions`, `patient-portal-invoices`, `patient-portal-register`, `public-booking`, `public-session-reschedule`, `public-referral-register`, `submit-consent-signature`, `generate-consent-pdf`, `generate-assessment-pdf`, `generate-invoice-pdf`

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
- `src/lib/export/` — data export helpers (e.g. Verifactu records)

### Data Fetching Pattern
Each feature area has its own hooks in `src/hooks/` (e.g., `usePatients`, `useBonos`, `useInvoices`). Hooks use TanStack Query for caching and mutations. Direct Supabase calls (not going through hooks) should be avoided in page components.

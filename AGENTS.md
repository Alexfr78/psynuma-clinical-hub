# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:8080
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

There is no test suite.

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
- `/cita/:token` — session management (patient self-service reschedule/cancel)
- `/consentimiento/:token` — consent signature
- `/evaluacion/:token` — assessment form
- `/emo/:token` — EMO assessment
- `/factura/:token` — invoice viewer
- `/portal/:slug` — patient portal login
- `/portal/:slug/dashboard` — patient portal dashboard
- `/book/:centerSlug` / `/reservas/:centerSlug` — public booking
- `/pagar/:token` — debt payment (Stripe)
- `/derivaciones/:centerSlug/registro` — referral self-registration
- `/registro/:token` — patient self-registration (autoregistro)

**Protected (therapist/admin):**
- `/dashboard`, `/agenda`, `/pacientes`, `/pacientes/:id`
- `/sesiones`, `/bonos`, `/facturas`, `/cobros`
- `/consentimientos`, `/evaluaciones`, `/autorregistros`
- `/notificaciones`, `/configuracion`
- Admin-only: `/profesionales`, `/derivaciones`, `/auditoria`, `/auditoria-clinica`, `/solicitudes`

### Database Schema (Supabase)
Types are auto-generated in `src/integrations/supabase/types.ts`. Key tables:
- **`centers`** — one per tenant; all data is scoped here
- **`profiles`** — one per user; has `center_id`, `first_name`, `last_name`, `specialty`, `is_active`
- **`user_roles`** — `user_id` + `role` (`admin` | `professional` | `patient`)
- **`patients`** — `center_id`, contact/demographic info, `status`
- **`calendar_events`** — therapy sessions/appointments; has recurrence support
- **`session_types`** — configurable session types per center (duration, price, color)
- **`bonos`** — therapy packages (session bundles) per patient
- **`invoices`** / **`invoice_items`** — billing; supports Spanish Verifactu e-invoicing
- **`payments`** / **`patient_debts`** — payment tracking
- **`consents`** / **`consent_templates`** — digital consent management with signature
- **`assessments`** / **`assessment_templates`** / **`assessment_responses`** — psychological assessments (DES, MMPI-2-RF, PAI, EMO)
- **`autoregistro_templates`** / **`autoregistro_links`** / **`autoregistro_entries`** — patient self-monitoring records
- **`notifications`** — in-app + WhatsApp notification queue
- **`audit_logs`** — system audit trail
- **`referrals`** — patient referrals from external sources

### Edge Functions (`supabase/functions/`, Deno runtime)
~70 edge functions. Key groups:

**Billing / Verifactu (Spanish e-invoicing):**
`seal-invoice-verifactu`, `sign-invoice-verifactu`, `submit-assessment-response`, `consulta-registro-verifactu`, `retry-pending-verifactu`, `export-verifactu-records`

**Payments (Stripe):**
`create-stripe-checkout`, `create-bono-checkout`, `create-debt-payment-checkout`, `stripe-webhook`, `create-stripe-connect-link`, `stripe-connect-callback`, `refresh-stripe-account-status`

**Notifications:**
`send-notification`, `send-session-reminders`, `send-payment-reminders`, `send-payment-reminder`, `process-email-queue`

**WhatsApp (WasenderAPI):**
`wasender-send-message`, `wasender-send-reminders`, `wasender-webhook`, `wasender-process-queue`, `wasender-connect`, `wasender-get-session`

**Google Calendar integration:**
`create-google-calendar-event`, `update-google-calendar-event`, `delete-zoom-meeting`, `cleanup-google-events`, `sync-google-calendar`, `setup-google-calendar-watch`, `google-calendar-webhook`, `renew-google-calendar-watches`, `oauth-google-callback`, `list-google-calendars`

**Zoom:**
`create-zoom-meeting`, `delete-zoom-meeting`, `renew-zoom-tokens`, `oauth-zoom-callback`

**AI / Assessments:**
`analyze-session-transcription`, `transcribe-session-audio`, `interpret-emo-results`, `interpret-mmpi2rf-results`, `interpret-pai-results`, `analyze-des-examples`

**Patient-facing (no JWT):**
`patient-portal-auth`, `patient-portal-sessions`, `patient-portal-invoices`, `patient-portal-register`, `public-booking`, `public-session-reschedule`, `public-referral-register`, `submit-consent-signature`, `generate-consent-pdf`, `generate-assessment-pdf`, `generate-invoice-pdf`

**Shared utilities** are in `supabase/functions/_shared/`.

### Settings Architecture
`src/pages/Settings.tsx` is a large tabbed settings page. Sub-sections live in `src/components/settings/`:
- Agenda, session types, locations, schedule exceptions
- Invoice series, invoice automation, Verifactu config
- Communications templates (email/WhatsApp)
- Integrations: Google Calendar, Zoom, Stripe, WhatsApp, Email, AI, OAuth credentials
- Portal settings, consent settings, referrals settings, security (MFA), version management

### Key Utility Files
- `src/lib/utils.ts` — `cn()` (Tailwind class merging)
- `src/lib/sanitize.ts` — HTML sanitization
- `src/lib/nif-validation.ts` — Spanish NIF/NIE validation
- `src/lib/recurrence-utils.ts` / `src/types/recurring.ts` — recurring calendar event logic
- `src/lib/verifactu-validation.ts` — Spanish e-invoicing validation
- `src/lib/whatsapp.ts` — WhatsApp message formatting

### Data Fetching Pattern
Each feature area has its own hooks in `src/hooks/` (e.g., `usePatients`, `useBonos`, `useInvoices`). Hooks use TanStack Query for caching and mutations. Direct Supabase calls (not going through hooks) should be avoided in page components.

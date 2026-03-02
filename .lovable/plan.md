

## Feature: Auto-invoice & auto-send on session completion (per patient)

### What it does
A new toggle on each patient's profile: **"Facturar automáticamente al completar sesión"**. When enabled, changing a session's status to "Completada" will automatically:
1. Generate a simplified invoice for that session
2. Send it to the patient via the center's configured channel (email/WhatsApp/both)

### Changes required

#### 1. Database migration
Add column to `patients` table:
```sql
ALTER TABLE patients ADD COLUMN auto_invoice_on_complete boolean NOT NULL DEFAULT false;
```

#### 2. Patient form (`PatientData.tsx`)
Add a Switch field "Facturar automáticamente al completar sesión" in the patient data form, bound to `auto_invoice_on_complete`.

#### 3. Session status change logic (`SessionDetailDrawer.tsx`)
In `handleStatusChange`, after successfully updating to `completed`:
- Check if `patient.auto_invoice_on_complete === true`
- If yes, automatically call the existing `useCreateSignedInvoice` flow (simplified invoice, single item with session details)
- Then send notification via `send-invoice-notification` edge function using the center's `invoice_send_channel` setting
- Show toast confirming auto-invoice was generated and sent

This reuses the existing invoice creation and notification infrastructure — no new edge functions needed.

#### 4. Patient schema update
Add `auto_invoice_on_complete` to the zod schema in `PatientData.tsx`.

### Technical details

- The auto-invoice logic will use `useCreateSignedInvoice` with `sendNotification: true` and the center's configured `invoice_send_channel`
- Invoice type will be `simplified` by default (matching the existing "auto" mode behavior)
- If VeriFactu auto is enabled, it will be processed through the existing VeriFactu pipeline
- The billable event will be created/used as part of the existing `useGetOrCreateBillableEvent` flow
- Error handling: if invoice generation fails, a toast error is shown but the session status change is preserved (session stays completed)


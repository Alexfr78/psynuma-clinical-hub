

## Investigation Summary

**Session**: Gonzalo de Porras, March 16, 2026, 18:00-19:00, 75€
- **Current state**: `status=completed`, `payment_status=pending`, price=75€
- **Debts**: None exist
- **Payments**: None exist
- **Invoices**: None exist

### Root Cause

There are **two bugs** working together:

1. **`generate-pending-debts` edge function didn't create the debt**. No debts were created today at all (zero records with `created_at >= 2026-03-17`). The cron job calls the edge function at 06:00 UTC but it appears to have failed silently — no logs are available either.

2. **`auto_complete_past_sessions` has a flawed condition**. It marks sessions as "completed" when there is **no debt record**. But it doesn't check `payment_status`. So if debt generation fails (bug 1), the auto-complete function wrongly assumes the session is paid and marks it completed.

   Current logic (broken):
   ```sql
   WHERE s.status IN ('scheduled', 'confirmed')
     AND s.session_date < CURRENT_DATE
     AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.session_id = s.id AND d.status IN ('pending', 'partial'))
   ```
   This passes when there are zero debts, even if `payment_status = 'pending'` and `price > 0`.

### Plan

#### 1. Fix data for Gonzalo's session immediately
- Revert session status from `completed` to `confirmed`
- Create the missing debt record (75€, pending)

#### 2. Fix `auto_complete_past_sessions` function
Add an extra condition: only auto-complete if the session either has `price = 0` OR `payment_status = 'paid'` OR there's a fully paid debt. This prevents completing sessions that simply have no debt record yet.

Updated logic:
```sql
WHERE s.status IN ('scheduled', 'confirmed')
  AND s.session_date < CURRENT_DATE
  AND (
    s.price = 0 OR s.payment_status = 'paid'
    OR EXISTS (SELECT 1 FROM debts d WHERE d.session_id = s.id AND d.status = 'paid')
  )
  AND NOT EXISTS (
    SELECT 1 FROM debts d WHERE d.session_id = s.id AND d.status IN ('pending', 'partial')
  )
```

#### 3. Make `generate-pending-debts` more resilient
- Add a DB-level fallback function `generate_pending_debts_db()` that runs as a Postgres function (not edge function), ensuring debt generation is not dependent on the edge function being reachable.
- Schedule it as a direct SQL cron at 06:00 UTC, replacing the HTTP call which can fail silently.

### Files to modify
- **New migration**: Fix Gonzalo's data + update `auto_complete_past_sessions` + add `generate_pending_debts_db` function + update cron jobs
- **`supabase/functions/generate-pending-debts/index.ts`**: Keep as-is (can still be called manually), but the cron will use the DB function


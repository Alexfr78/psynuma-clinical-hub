

## Root Cause Analysis

The issue is a **critical gap in conflict detection** across multiple session movement paths:

### Paths WITHOUT conflict detection (bugs):
1. **`MoveSessionDialog.tsx`** — The internal "Move session" dialog has **zero conflict checking**. It directly calls `onMove` which updates the session without any overlap validation.
2. **`Agenda.tsx` → `handleSessionMove`** (drag-and-drop in DayView/WeekView) — Also has **no conflict detection**. It calls `updateSession.mutateAsync` directly.
3. **`public-session-reschedule` edge function** — Has availability-based slot generation (so only shows free slots), but has a **TOCTOU race condition**: between verifying the slot is available (line 217-226) and performing the update (line 245-255), another session could be created. No database-level lock or constraint prevents this.

### Paths WITH conflict detection (working correctly):
- `QuickCreateSessionDialog.tsx` — Uses `checkSessionConflicts()` before creating
- `SessionDetailDrawer.tsx` — Uses `checkSessionConflicts()` when editing date/time

### The specific incident
Jose Maria Pascual likely rescheduled via the public reschedule flow or the admin used drag-and-drop / MoveSessionDialog — all of which lack proper conflict guards.

---

## Plan

### 1. Add conflict detection to `MoveSessionDialog.tsx`
- Import and call `checkSessionConflicts()` before executing `onMove`
- Show a warning with conflicting session details if overlap detected
- Allow the user to force-move (with explicit confirmation) or cancel
- Display a `ConflictsDialog` similar to what `QuickCreateSessionDialog` uses

### 2. Add conflict detection to `handleSessionMove` in `Agenda.tsx` (drag-and-drop)
- Before calling `updateSession.mutateAsync`, run `checkSessionConflicts()` 
- If conflicts found, show a toast/dialog warning and abort the move
- Alternatively, open the `MoveSessionDialog` pre-filled so the user sees the conflict warning

### 3. Harden the public reschedule edge function against race conditions
- In the `reschedule` action handler (`public-session-reschedule/index.ts`), add an explicit query for overlapping sessions **after** re-verifying availability and **just before** the update
- Use a `SELECT ... FOR UPDATE` row lock on the professional's sessions for that date to prevent concurrent writes
- If overlap is detected at this point, return a 409 error

### 4. Add a database-level validation trigger (defense in depth)
- Create a database trigger `validate_no_session_overlap` on the `sessions` table (INSERT and UPDATE)
- The trigger checks if any other non-cancelled session for the same `professional_id` overlaps the new `session_date`/`start_time`/`end_time` range
- If overlap found, raise an exception — this prevents double-booking even under race conditions
- This is the ultimate safety net regardless of which code path creates/moves the session

### Files to modify:
- `src/components/agenda/MoveSessionDialog.tsx` — Add conflict check + warning UI
- `src/pages/Agenda.tsx` — Add conflict check to `handleSessionMove`
- `supabase/functions/public-session-reschedule/index.ts` — Add row-level locking before update
- **New migration** — Database trigger `validate_no_session_overlap`


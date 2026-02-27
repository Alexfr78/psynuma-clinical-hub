

## Problem

The `create-zoom-meeting` edge function expects `end_time` in the request body (line 115), but the `handleModalityChange` in `SessionDetailDrawer.tsx` sends `duration` instead (line 632). This causes `end_time` to be `undefined`, crashing at `end_time.split(':')`.

## Fix

**File: `src/components/agenda/SessionDetailDrawer.tsx` (lines 626-633)**

Change the call to `create-zoom-meeting` to send `end_time` instead of `duration`, matching what the edge function expects:

```typescript
const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
  body: {
    professional_id: session.professional_id,
    topic: `Sesión con ${patientDisplayName}`,
    session_date: session.session_date,
    start_time: session.start_time,
    end_time: session.end_time,        // was: duration: durationMinutes
    patient_name: patientDisplayName,
  },
});
```

Single line change — replace `duration: durationMinutes,` with `end_time: session.end_time,` and add `patient_name`.




## Plan: Fix location auto-selection not triggering on dialog open

### Root Cause

The auto-selection `useEffect` (line 282) depends on `watchSessionDate`. When the dialog opens, `form.reset()` sets `session_date` to `initialDate || new Date()` — but this is often the **same value** as the form's `defaultValues` or the previous session. Since `watchSessionDate` doesn't change, React skips the effect entirely.

### Fix

Add `open` to the dependency array of the auto-selection `useEffect` so it re-runs every time the dialog opens:

```typescript
useEffect(() => {
  if (!open || !watchSessionDate || !locations || !allSchedules || userOverrodeLocation) return;
  
  const result = getDefaultLocationForDate(
    watchSessionDate,
    locations,
    allSchedules,
    integrations?.default_video_provider
  );
  if (result) {
    form.setValue('session_modality', result.modality);
    if (result.isOnline) {
      form.setValue('location_id', '');
    } else {
      form.setValue('location_id', result.locationId);
      form.setValue('video_call_link', '');
    }
  }
}, [open, watchSessionDate, locations, allSchedules, userOverrodeLocation, integrations?.default_video_provider, form]);
```

### File

| File | Change |
|---|---|
| `src/components/agenda/QuickCreateSessionDialog.tsx` | Add `open` guard and dependency to auto-selection useEffect |


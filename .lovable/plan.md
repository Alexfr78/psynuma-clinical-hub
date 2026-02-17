

## Fix: Prevent accidental interval changes in recurrence settings

### Root Cause

The database shows the recently created series have `interval: 30` instead of the intended `interval: 1`. This means the generation algorithm works correctly, but produces sessions every 30 weeks instead of every week.

The cause is the `<input type="number">` in the recurrence interval field. Browser number inputs respond to mouse wheel scroll events, so scrolling the dialog while the mouse hovers over the interval field silently changes the value. This is a well-known UX problem.

### Changes

#### 1. `src/components/agenda/RecurrenceSettings.tsx`

- Add `onWheel` handler to the interval and count number inputs to prevent scroll from changing values: `onWheel={(e) => (e.target as HTMLInputElement).blur()}`
- Change `defaultRecurrenceConfig` to a function (`getDefaultRecurrenceConfig()`) that returns a fresh object each time, preventing any potential shared-reference mutation bugs

#### 2. `src/components/agenda/QuickCreateSessionDialog.tsx`

- Update imports and usages of `defaultRecurrenceConfig` to use the new function `getDefaultRecurrenceConfig()`

#### 3. `src/lib/recurrence-utils.ts`

- Add early exit in `generateWeeklyOccurrences` when `currentWeekStart` is past `endDate` (performance optimization and safety)

### Files to modify
- `src/components/agenda/RecurrenceSettings.tsx` - Prevent scroll on number inputs, change default config to factory function
- `src/components/agenda/QuickCreateSessionDialog.tsx` - Use factory function for defaults
- `src/lib/recurrence-utils.ts` - Add early exit optimization

### Note about existing data
The two series created today (`4e725351` and `834bf212`) with `interval: 30` will need to be deleted and recreated with the correct interval, or their sessions can be manually managed from the agenda.


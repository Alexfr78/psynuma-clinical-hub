

## Root Cause

`QuickCreateSessionDialog` renders inside a Vaul `Drawer` on mobile (via `ResponsiveDialog`). This causes cascading UX failures:

1. **Patient search**: The inline `Command` component works but fights with Vaul's drag-to-dismiss — any vertical swipe on the results list can close the drawer instead of scrolling.
2. **Date picker**: `Popover` + `Calendar` inside a Drawer creates z-index conflicts and touch interception. The calendar often appears behind the overlay or gets dismissed when tapped.
3. **Time selectors**: `Select` (Radix) opens a portal-based dropdown that competes with the Drawer's overlay and body scroll lock. On small screens, the dropdown gets clipped or positioned off-screen.
4. **Scroll**: The Drawer's `max-h-[90vh]` with internal `overflow-y-auto` creates nested scrolling contexts. When the virtual keyboard opens, the available height shrinks but the Drawer doesn't adapt, hiding the submit buttons.
5. **No sticky footer**: The "Crear sesión" button scrolls with the form content, so it disappears behind the keyboard.

## Approach: Full-Screen Page on Mobile

On mobile, replace the Drawer entirely with a **full-screen overlay** (using `Sheet side="bottom"` at `h-[100dvh]`). This eliminates Vaul's drag-to-dismiss, body scroll lock, and nested overlay problems. Desktop stays unchanged (Dialog via `ResponsiveDialog`).

### Architecture

```text
QuickCreateSessionDialog (entry point)
├── Desktop: current ResponsiveDialog (no changes)
└── Mobile: MobileSessionForm (new component)
    ├── Fixed header (title + close button)
    ├── Scrollable form body (single scroll context)
    │   ├── Patient: tap → MobilePatientSearch (full-screen sheet)
    │   ├── Date: inline Calendar (no Popover)
    │   ├── Time: native <input type="time"> (OS picker)
    │   ├── All Select fields: remain as-is (work fine in Sheet)
    │   └── Notifications, Recurrence, etc.
    └── Sticky footer (safe-area-aware, always visible)
```

### Files to create/modify

1. **`src/components/agenda/MobilePatientSearch.tsx`** (new)
   - Full-screen Sheet (`side="bottom"`, `h-[100dvh]`)
   - Auto-focused search input at top
   - Large touch-friendly patient list (min-h-12 per row)
   - "Crear nuevo paciente" button when no results
   - Closes on selection, returns patient ID via callback

2. **`src/components/agenda/MobileSessionForm.tsx`** (new)
   - Rendered inside a `Sheet side="bottom"` with `h-[100dvh]` and `flex flex-col`
   - Fixed header with title + X close button
   - `flex-1 overflow-y-auto` body with `pb-[env(safe-area-inset-bottom)]`
   - Patient field: displays selected name, tap opens `MobilePatientSearch`
   - Date field: inline `Calendar` component (no Popover wrapper)
   - Time fields: `<input type="time">` with standard Input styling — triggers native OS time picker on iOS/Android
   - All other fields (professional, session type, modality, etc.) keep using `Select` which works fine inside Sheet
   - Sticky footer with `position: sticky; bottom: 0` + safe-area padding + background blur
   - Receives all the same props and form logic as the current dialog

3. **`src/components/agenda/QuickCreateSessionDialog.tsx`** (modified)
   - Add `isMobile` check at the top level render
   - If mobile: render `<MobileSessionForm>` instead of the current `<Dialog>` block
   - If desktop: keep current code unchanged
   - Move shared form logic (schema, submit handler, effects) to remain in this file
   - Pass form instance + handlers to `MobileSessionForm`

### Key UX decisions

| Problem | Mobile solution |
|---|---|
| Patient search focus/scroll | Separate full-screen sheet, auto-focus input, no overlay conflicts |
| Date picker | Inline Calendar rendered directly in form flow, no Popover |
| Time picker | Native `<input type="time">` — OS-level picker, no dropdown issues |
| Keyboard hiding buttons | Sticky footer with `bottom: 0`, `bg-background`, safe-area padding |
| Nested scroll | Single scroll context: `flex-1 overflow-y-auto` on form body only |
| Drawer drag-dismiss | Using Sheet (Radix Dialog) instead of Vaul Drawer — no accidental swipe-close |
| Safe areas (iPhone notch) | `pb-[env(safe-area-inset-bottom)]` on footer |

### What stays the same on desktop
The entire current Dialog-based flow remains untouched. The `isMobile` branching happens at the render level of `QuickCreateSessionDialog`, so no desktop regression is possible.

### Validation checklist (will verify post-implementation)
- Can type patient name without focus loss
- Can scroll patient results without closing overlay
- Can pick start/end times without overlay conflicts
- Can scroll full form naturally
- Submit button visible with keyboard open
- No dead zones at bottom of form
- Works on both iOS Safari and Android Chrome viewport behaviors


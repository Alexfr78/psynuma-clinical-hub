

## Plan: Add patient filter to Bonos page

### What changes
Add a patient search input to the Bonos page header so users can filter bonos by a specific patient. When a patient is selected, show all their bonos across all statuses (overriding the status tab filter).

### Implementation

**1. Bonos.tsx — Add patient search filter**
- Add a search input + combobox (similar to PatientSelector pattern) above the tabs
- Add state `selectedPatientId: string | undefined`
- Pass `selectedPatientId` as `patientId` filter to `useBonos`
- When a patient is selected, switch to "all" status tab automatically so the user sees every bono for that patient
- Show a clear button to reset the patient filter

**2. useBonos hook — Already supports `patientId` filter**
The `useBonos` hook at line 80 already accepts `{ patientId?: string; status?: string }` and correctly applies both filters. No changes needed here.

### Technical details
- Reuse the existing patient fetching pattern (query `patients` table with search)
- Use a Popover + Command (combobox) component from shadcn/ui, consistent with `PatientSelector.tsx`
- The patient search will be a simple text input that filters by name
- Pass both `patientId` and `status` to `useBonos` — when patient is selected and status is "all", only `patientId` is sent

### Files to modify
- `src/pages/Bonos.tsx` — Add patient filter UI and state




## Plan: Fix consent PDF generation - redeploy edge function

### Problem
The `sanitizeForPdf` fix (removing zero-width spaces U+200B) was added to the code but the edge function wasn't redeployed. The running version is still the old one that crashes on these characters.

### Solution
1. **Redeploy `generate-consent-pdf`** edge function - this is the only action needed. The code already contains the fix.

2. **Additional safety**: Wrap all `drawText` calls that use dynamic data (center name, address, patient name, professional name, signer name) with `sanitizeForPdf()` to prevent any other string from causing the same crash. Currently only the main document content goes through sanitization, but metadata strings are passed raw.

### Changes
- **`supabase/functions/generate-consent-pdf/index.ts`**: Apply `sanitizeForPdf()` to all dynamic strings passed to `drawText` (center name, address, patient/professional names, signer names, template name, dates)
- **Redeploy** the edge function


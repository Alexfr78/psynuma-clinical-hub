

## Plan: Fix merge failing on Verifactu-signed invoices

### Problem
The `prevent_signed_invoice_modification_trigger` on the `invoices` table blocks **any** change to `patient_id` on Verifactu-signed invoices. The `merge_patients` function correctly updates only `patient_id` (without touching `updated_at`), but the trigger still rejects it because `patient_id` is listed as a critical field.

### Solution
Update the trigger function to allow `patient_id` changes **when called from `merge_patients`** (i.e., when only `patient_id` changes and no other critical fields are modified). This preserves VeriFactu integrity since the XML hash, amounts, and invoice number remain untouched.

### Implementation

**1. Database migration — Update trigger function**

Modify the `prevent_signed_invoice_modification` function to add a new allowed condition: if **only** `patient_id` changes (and `invoice_number`, `issue_date`, `subtotal`, `tax_amount`, `total` remain the same), permit the update. This is safe because VeriFactu XML records the patient's NIF at signing time and the hash is not recalculated.

```sql
-- In the critical fields check, remove patient_id from the block list
-- and add a separate early-return for patient_id-only changes
IF (
  NEW.patient_id IS DISTINCT FROM OLD.patient_id AND
  NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number AND
  NEW.issue_date IS NOT DISTINCT FROM OLD.issue_date AND
  NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal AND
  NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount AND
  NEW.total IS NOT DISTINCT FROM OLD.total
) THEN
  -- Allow patient_id reassignment (merge) without touching financial data
  RETURN NEW;
END IF;
```

### Files to modify
- New database migration (SQL) to replace the trigger function

### No frontend changes needed
The merge dialog and RPC call already handle Verifactu invoices correctly. Only the trigger is blocking the operation.


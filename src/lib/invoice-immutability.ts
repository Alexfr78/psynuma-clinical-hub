type FiscalInvoiceState = {
  invoice_hash?: string | null;
  verifactu_hash?: string | null;
  verifactu_registration_id?: string | null;
};

export function isInvoiceFiscalLocked(invoice: FiscalInvoiceState | null | undefined) {
  return !!(
    invoice?.invoice_hash ||
    invoice?.verifactu_hash ||
    invoice?.verifactu_registration_id
  );
}

export function hasInvoiceAeatRegistration(invoice: FiscalInvoiceState | null | undefined) {
  return !!invoice?.verifactu_registration_id;
}

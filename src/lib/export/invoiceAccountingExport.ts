export interface AccountingExportPatient {
  first_name?: string | null;
  last_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
}

export interface AccountingExportInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  operation_date?: string | null;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  retention_amount: number | string | null;
  total: number | string;
  notes: string | null;
  status: string | null;
  is_valid: boolean;
  series_id: string | null;
  center_id: string;
  verifactu_invoice_type?: string | null;
  rectification_type?: string | null;
  rectification_reason_code?: string | null;
  rectified_invoice_id?: string | null;
  correction_operation_id?: string | null;
  recipient_snapshot?: unknown;
  patients: AccountingExportPatient | null;
  series?: {
    invoice_type?: string | null;
    series_type?: string | null;
  } | null;
  rectified_invoice?: {
    invoice_number?: string | null;
    issue_date?: string | null;
  } | null;
  invoice_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  payments: Array<{
    amount: number;
    payment_date: string;
    payment_method: string;
    notes?: string | null;
    reference?: string | null;
  }>;
}

export interface AccountingSubstitutionReference {
  replacement_invoice_id: string;
  invoice_number: string;
  issue_date: string;
}

export interface InvoiceExportRow {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  operation_date: string;
  description: string;
  client_name: string;
  client_tax_id: string;
  client_address: string;
  client_city: string;
  client_postal_code: string;
  client_email: string;
  client_country: string;
  fiscal_recipient_source: string;
  fiscal_invoice_type: string;
  correction_kind: string;
  rectification_type: string;
  rectification_reason_code: string;
  replaced_invoice_numbers: string;
  replaced_invoice_dates: string;
  net_amount: string;
  vat_amount: string;
  irpf_retention: string;
  total_amount: string;
  currency: string;
  payment_status: string;
  payment_method: string;
  payment_date: string;
  payment_notes: string;
  vat_zone: string;
  vat_due_mode: string;
  import_format: string;
  psycma_invoice_id: string;
  psycma_center_id: string;
  psycma_series_id: string;
  psycma_status: string;
  psycma_is_valid: string;
  psycma_correction_operation_id: string;
}

export const INVOICE_CSV_COLUMNS: Array<{ key: keyof InvoiceExportRow; header: string }> = [
  // Keep the original expense-scribe column order stable for backwards compatibility.
  { key: 'invoice_number', header: 'invoice_number' },
  { key: 'invoice_date', header: 'invoice_date' },
  { key: 'due_date', header: 'due_date' },
  { key: 'description', header: 'description' },
  { key: 'client_name', header: 'client_name' },
  { key: 'client_tax_id', header: 'client_tax_id' },
  { key: 'client_country', header: 'client_country' },
  { key: 'net_amount', header: 'net_amount' },
  { key: 'vat_amount', header: 'vat_amount' },
  { key: 'irpf_retention', header: 'irpf_retention' },
  { key: 'total_amount', header: 'total_amount' },
  { key: 'currency', header: 'currency' },
  { key: 'payment_status', header: 'payment_status' },
  { key: 'payment_method', header: 'payment_method' },
  { key: 'payment_date', header: 'payment_date' },
  { key: 'payment_notes', header: 'payment_notes' },
  { key: 'vat_zone', header: 'vat_zone' },
  { key: 'vat_due_mode', header: 'vat_due_mode' },
  { key: 'import_format', header: 'import_format' },
  { key: 'psycma_invoice_id', header: 'psycma_invoice_id' },
  { key: 'psycma_center_id', header: 'psycma_center_id' },
  { key: 'psycma_series_id', header: 'psycma_series_id' },
  { key: 'psycma_status', header: 'psycma_status' },

  // Fiscal traceability fields introduced for F3 and substitution rectificativas.
  { key: 'operation_date', header: 'operation_date' },
  { key: 'client_address', header: 'client_address' },
  { key: 'client_city', header: 'client_city' },
  { key: 'client_postal_code', header: 'client_postal_code' },
  { key: 'client_email', header: 'client_email' },
  { key: 'fiscal_recipient_source', header: 'fiscal_recipient_source' },
  { key: 'fiscal_invoice_type', header: 'fiscal_invoice_type' },
  { key: 'correction_kind', header: 'correction_kind' },
  { key: 'rectification_type', header: 'rectification_type' },
  { key: 'rectification_reason_code', header: 'rectification_reason_code' },
  { key: 'replaced_invoice_numbers', header: 'replaced_invoice_numbers' },
  { key: 'replaced_invoice_dates', header: 'replaced_invoice_dates' },
  { key: 'psycma_is_valid', header: 'psycma_is_valid' },
  { key: 'psycma_correction_operation_id', header: 'psycma_correction_operation_id' },
];

type FiscalRecipientSnapshot = {
  name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
};

function getRecipientSnapshot(value: unknown): FiscalRecipientSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as FiscalRecipientSnapshot;
}

function inferFiscalInvoiceType(invoice: AccountingExportInvoice): string {
  if (invoice.verifactu_invoice_type) return invoice.verifactu_invoice_type;
  if (invoice.rectified_invoice_id) {
    return invoice.rectification_reason_code
      || (invoice.series?.invoice_type === 'simplified' ? 'R5' : 'R1');
  }
  return invoice.series?.invoice_type === 'simplified' ? 'F2' : 'F1';
}

function getCorrectionKind(invoice: AccountingExportInvoice, fiscalType: string): string {
  if (fiscalType === 'F3') return 'f3_replacement';
  if (!invoice.rectified_invoice_id) return '';
  return invoice.rectification_type === 'substitution'
    ? 'rectificativa_substitution'
    : 'rectificativa_differences';
}

export function buildInvoiceAccountingRows(
  invoices: AccountingExportInvoice[],
  substitutions: AccountingSubstitutionReference[],
): InvoiceExportRow[] {
  const substitutionsByReplacement = new Map<string, AccountingSubstitutionReference[]>();
  substitutions.forEach((reference) => {
    const existing = substitutionsByReplacement.get(reference.replacement_invoice_id) || [];
    existing.push(reference);
    substitutionsByReplacement.set(reference.replacement_invoice_id, existing);
  });

  return invoices.map((invoice) => {
    const patient = invoice.patients;
    const snapshot = getRecipientSnapshot(invoice.recipient_snapshot);
    const contactName = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim();
    const fiscalType = inferFiscalInvoiceType(invoice);
    const correctionKind = getCorrectionKind(invoice, fiscalType);
    const f3References = substitutionsByReplacement.get(invoice.id) || [];
    const replacedReferences = invoice.rectified_invoice?.invoice_number
      ? [{
          invoice_number: invoice.rectified_invoice.invoice_number,
          issue_date: invoice.rectified_invoice.issue_date || '',
        }]
      : f3References;

    const description = invoice.invoice_items.length > 0
      ? invoice.invoice_items
          .map((item) => `${item.description} x${item.quantity} (${item.unit_price}€)`)
          .join('; ')
      : invoice.notes || '';

    const totalPaid = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const invoiceTotal = Number(invoice.total) || 0;
    const paymentStatus = totalPaid >= invoiceTotal && invoiceTotal > 0
      ? 'paid'
      : totalPaid > 0
        ? 'partial'
        : 'unpaid';

    const methods = [...new Set(invoice.payments.map((payment) => payment.payment_method))];
    const paymentMethod = methods.length === 1 ? methods[0] : methods.length > 1 ? 'mixed' : '';
    const paymentDates = invoice.payments
      .map((payment) => payment.payment_date)
      .filter(Boolean)
      .sort();
    const paymentNotes = invoice.payments
      .map((payment) => [payment.reference, payment.notes].filter(Boolean).join(' - '))
      .filter(Boolean)
      .join('; ');

    return {
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.issue_date || '',
      due_date: invoice.due_date || '',
      operation_date: invoice.operation_date || invoice.issue_date || '',
      description,
      client_name: snapshot?.name?.trim() || contactName,
      client_tax_id: snapshot?.tax_id?.trim() || patient?.tax_id || '',
      client_address: snapshot?.address?.trim() || patient?.address || '',
      client_city: snapshot?.city?.trim() || patient?.city || '',
      client_postal_code: snapshot?.postal_code?.trim() || patient?.postal_code || '',
      client_email: snapshot?.email?.trim() || patient?.email || '',
      client_country: 'ES',
      fiscal_recipient_source: snapshot ? 'invoice_snapshot' : 'contact',
      fiscal_invoice_type: fiscalType,
      correction_kind: correctionKind,
      rectification_type: invoice.rectification_type === 'substitution'
        ? 'S'
        : invoice.rectification_type === 'differences'
          ? 'I'
          : invoice.rectification_type || '',
      rectification_reason_code: invoice.rectification_reason_code || '',
      replaced_invoice_numbers: replacedReferences.map((reference) => reference.invoice_number).join('; '),
      replaced_invoice_dates: replacedReferences.map((reference) => reference.issue_date).filter(Boolean).join('; '),
      net_amount: String(Number(invoice.subtotal) || 0),
      vat_amount: String(Number(invoice.tax_amount) || 0),
      irpf_retention: String(Number(invoice.retention_amount) || 0),
      total_amount: String(invoiceTotal),
      currency: 'EUR',
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      payment_date: paymentDates.at(-1) || '',
      payment_notes: paymentNotes,
      vat_zone: '',
      vat_due_mode: '',
      import_format: 'psycma',
      psycma_invoice_id: invoice.id,
      psycma_center_id: invoice.center_id,
      psycma_series_id: invoice.series_id || '',
      psycma_status: invoice.status || '',
      psycma_is_valid: invoice.is_valid ? 'true' : 'false',
      psycma_correction_operation_id: invoice.correction_operation_id || '',
    };
  });
}

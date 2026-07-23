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
  cancellation_date?: string | null;
  cancellation_reason?: string | null;
  operation_date?: string | null;
  subtotal: number | string | null;
  tax_rate?: number | string | null;
  tax_amount: number | string | null;
  retention_amount: number | string | null;
  total: number | string;
  notes: string | null;
  status: string | null;
  is_valid: boolean;
  series_id: string | null;
  center_id: string;
  invoice_hash?: string | null;
  previous_invoice_hash?: string | null;
  verifactu_hash?: string | null;
  verifactu_invoice_type?: string | null;
  verifactu_pending?: boolean | null;
  verifactu_registration_id?: string | null;
  verifactu_timestamp?: string | null;
  rectification_type?: string | null;
  rectification_reason_code?: string | null;
  rectified_invoice_id?: string | null;
  correction_operation_id?: string | null;
  recipient_snapshot?: unknown;
  patients: AccountingExportPatient | null;
  series?: {
    name?: string | null;
    invoice_type?: string | null;
    series_type?: string | null;
  } | null;
  rectified_invoice?: {
    id?: string | null;
    invoice_number?: string | null;
    issue_date?: string | null;
  } | null;
  invoice_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    tax_rate?: number | null;
    session_id?: string | null;
    bono_id?: string | null;
    session?: {
      session_date?: string | null;
    } | null;
    bono?: {
      created_at?: string | null;
    } | null;
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
  substituted_invoice_id: string;
  invoice_number: string;
  issue_date: string;
}

export interface AccountingVerifactuRecord {
  id: string;
  invoice_id: string;
  record_type: string;
  hash: string;
  previous_hash: string | null;
  aeat_status: string;
  aeat_csv: string | null;
  aeat_response_xml: string | null;
  xml_sent: string;
  created_at: string;
}

export interface AccountingVerifactuEvent {
  invoice_id: string | null;
  event_type: string;
  aeat_csv: string | null;
  aeat_response_code: string | null;
  aeat_response_xml: string | null;
  error_details: string | null;
  created_at: string;
}

export interface InvoiceExportRow {
  // The first 37 fields are the immutable accounting export contract.
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

  // Accounting export schema v2 fields. These 17 fields are append-only.
  export_schema_version: string;
  invoice_series: string;
  vat_rate: string;
  operation_qualification: string;
  tax_exemption_code: string;
  fiscal_status: string;
  verifactu_record_type: string;
  cancellation_date: string;
  cancellation_reason: string;
  rectified_psycma_invoice_ids: string;
  verifactu_generated_at: string;
  verifactu_sent_at: string;
  verifactu_submission_status: string;
  verifactu_hash: string;
  previous_record_hash: string;
  aeat_response_code: string;
  aeat_csv: string;
}

export const INVOICE_CSV_COLUMNS: Array<{ key: keyof InvoiceExportRow; header: string }> = [
  // Original 23 expense-scribe fields.
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

  // Original fiscal traceability fields (24-37). Do not reorder.
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

  // Schema v2 fields (38-54). Append only.
  { key: 'export_schema_version', header: 'export_schema_version' },
  { key: 'invoice_series', header: 'invoice_series' },
  { key: 'vat_rate', header: 'vat_rate' },
  { key: 'operation_qualification', header: 'operation_qualification' },
  { key: 'tax_exemption_code', header: 'tax_exemption_code' },
  { key: 'fiscal_status', header: 'fiscal_status' },
  { key: 'verifactu_record_type', header: 'verifactu_record_type' },
  { key: 'cancellation_date', header: 'cancellation_date' },
  { key: 'cancellation_reason', header: 'cancellation_reason' },
  { key: 'rectified_psycma_invoice_ids', header: 'rectified_psycma_invoice_ids' },
  { key: 'verifactu_generated_at', header: 'verifactu_generated_at' },
  { key: 'verifactu_sent_at', header: 'verifactu_sent_at' },
  { key: 'verifactu_submission_status', header: 'verifactu_submission_status' },
  { key: 'verifactu_hash', header: 'verifactu_hash' },
  { key: 'previous_record_hash', header: 'previous_record_hash' },
  { key: 'aeat_response_code', header: 'aeat_response_code' },
  { key: 'aeat_csv', header: 'aeat_csv' },
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

function extractXmlValue(xml: string | null | undefined, tag: string): string {
  if (!xml) return '';
  const match = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<\\/[^>]*${tag}[^>]*>`, 'i'));
  return match?.[1]?.trim() || '';
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasInvoiceFiscalRecipient(snapshot: FiscalRecipientSnapshot | null): boolean {
  return Boolean(snapshot && hasText(snapshot.name) && hasText(snapshot.tax_id));
}

function getFiscalRecipientSource(
  snapshot: FiscalRecipientSnapshot | null,
  patient: AccountingExportPatient | null,
): 'invoice' | 'contact' | 'none' {
  if (snapshot && Object.values(snapshot).some((value) => hasText(value))) return 'invoice';
  if (patient && [
    patient.first_name,
    patient.last_name,
    patient.tax_id,
    patient.address,
    patient.city,
    patient.postal_code,
    patient.email,
  ].some((value) => hasText(value))) return 'contact';
  return 'none';
}

function inferInvoiceType(
  invoice: AccountingExportInvoice,
  snapshot: FiscalRecipientSnapshot | null,
): string {
  if (invoice.verifactu_invoice_type) return invoice.verifactu_invoice_type;
  if (invoice.rectified_invoice_id) {
    if (invoice.rectification_reason_code?.match(/^R[1-5]$/)) {
      return invoice.rectification_reason_code;
    }
    return invoice.series?.invoice_type === 'simplified' ? 'R5' : 'R1';
  }
  if (invoice.series?.invoice_type === 'simplified') {
    return hasInvoiceFiscalRecipient(snapshot) ? 'F1' : 'F2';
  }
  return 'F1';
}

function getCorrectionKind(invoice: AccountingExportInvoice, fiscalType: string): string {
  if (fiscalType === 'F3') return 'f3_replacement';
  if (!invoice.rectified_invoice_id) return '';
  return normalizeRectificationType(invoice.rectification_type) === 'S'
    ? 'rectificativa_substitution'
    : 'rectificativa_differences';
}

function normalizeRectificationType(value: string | null | undefined): string {
  if (value === 'substitution' || value === 'S') return 'S';
  if (value === 'differences' || value === 'I') return 'I';
  return '';
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toFixed(2)));
}

function resolveOperationDate(invoice: AccountingExportInvoice): string {
  const sessionDates = [...new Set(
    invoice.invoice_items
      .map((item) => item.session?.session_date?.slice(0, 10))
      .filter((value): value is string => Boolean(value)),
  )];
  if (sessionDates.length === 1) return sessionDates[0];

  const bonoDates = [...new Set(
    invoice.invoice_items
      .filter((item) => item.bono_id)
      .map((item) => item.bono?.created_at?.slice(0, 10))
      .filter((value): value is string => Boolean(value)),
  )];
  if (sessionDates.length === 0 && bonoDates.length === 1) return bonoDates[0];

  return invoice.operation_date?.slice(0, 10) || '';
}

function normalizeSubmissionStatus(
  invoice: AccountingExportInvoice,
  record: AccountingVerifactuRecord | undefined,
  event: AccountingVerifactuEvent | undefined,
): string {
  const responseStatus = extractXmlValue(
    record?.aeat_response_xml || event?.aeat_response_xml,
    'EstadoRegistro',
  ).toLowerCase();

  if (responseStatus.includes('error')) return 'accepted_with_errors';
  if (record?.aeat_status === 'accepted') return 'accepted';
  if (record?.aeat_status === 'rejected') return 'rejected';
  if (record?.aeat_status === 'not_sent') return 'not_sent';
  if (record?.aeat_status === 'pending' || record?.aeat_status === 'error') return 'pending';
  if (event?.event_type === 'error' && (event.aeat_response_code || event.aeat_response_xml)) {
    return 'rejected';
  }
  if (event?.event_type === 'alta' || event?.event_type === 'anulacion') return 'accepted';
  if (invoice.verifactu_pending) return 'pending';
  if (invoice.verifactu_registration_id) return 'accepted';
  return '';
}

function findRecordEvent(
  record: AccountingVerifactuRecord | undefined,
  events: AccountingVerifactuEvent[],
): AccountingVerifactuEvent | undefined {
  if (!record) return events[events.length - 1];
  const sameType = events.filter((event) => event.event_type === record.record_type);
  const precedingEvents = sameType.filter((event) => event.created_at <= record.created_at);
  return precedingEvents[precedingEvents.length - 1] || sameType[sameType.length - 1];
}

export function buildInvoiceAccountingRows(
  invoices: AccountingExportInvoice[],
  substitutions: AccountingSubstitutionReference[],
  verifactuRecords: AccountingVerifactuRecord[] = [],
  verifactuEvents: AccountingVerifactuEvent[] = [],
): InvoiceExportRow[] {
  const substitutionsByReplacement = new Map<string, AccountingSubstitutionReference[]>();
  substitutions.forEach((reference) => {
    const existing = substitutionsByReplacement.get(reference.replacement_invoice_id) || [];
    existing.push(reference);
    substitutionsByReplacement.set(reference.replacement_invoice_id, existing);
  });

  const recordsByInvoice = new Map<string, AccountingVerifactuRecord[]>();
  verifactuRecords.forEach((record) => {
    const existing = recordsByInvoice.get(record.invoice_id) || [];
    existing.push(record);
    recordsByInvoice.set(record.invoice_id, existing);
  });
  recordsByInvoice.forEach((records) => records.sort((a, b) => a.created_at.localeCompare(b.created_at)));

  const eventsByInvoice = new Map<string, AccountingVerifactuEvent[]>();
  verifactuEvents.forEach((event) => {
    if (!event.invoice_id) return;
    const existing = eventsByInvoice.get(event.invoice_id) || [];
    existing.push(event);
    eventsByInvoice.set(event.invoice_id, existing);
  });
  eventsByInvoice.forEach((events) => events.sort((a, b) => a.created_at.localeCompare(b.created_at)));

  return invoices.flatMap((invoice) => {
    const patient = invoice.patients;
    const snapshot = getRecipientSnapshot(invoice.recipient_snapshot);
    const contactName = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim();
    const recipientSource = getFiscalRecipientSource(snapshot, patient);
    const clientName = snapshot?.name?.trim() || contactName;
    const clientTaxId = snapshot?.tax_id?.trim() || patient?.tax_id || '';
    const fiscalInvoiceType = inferInvoiceType(invoice, snapshot);
    const correctionKind = getCorrectionKind(invoice, fiscalInvoiceType);
    const f3References = substitutionsByReplacement.get(invoice.id) || [];
    const directReference = invoice.rectified_invoice?.invoice_number
      ? [{
          invoice_number: invoice.rectified_invoice.invoice_number,
          issue_date: invoice.rectified_invoice.issue_date || '',
          id: invoice.rectified_invoice.id || invoice.rectified_invoice_id || '',
        }]
      : [];
    const references = directReference.length > 0
      ? directReference
      : f3References.map((reference) => ({
          ...reference,
          id: reference.substituted_invoice_id,
        }));

    const description = invoice.invoice_items.length > 0
      ? invoice.invoice_items
          .map((item) => `${item.description} x${item.quantity} (${item.unit_price}€)`)
          .join('; ')
      : invoice.notes || '';

    const totalPaid = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const storedTotal = Number(invoice.total) || 0;
    const paymentStatus = totalPaid >= storedTotal && storedTotal > 0
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

    const netAmount = Number(invoice.subtotal) || 0;
    const vatAmount = Number(invoice.tax_amount) || 0;
    const retentionAmount = Number(invoice.retention_amount) || 0;
    const fiscalStatus = invoice.status === 'cancelled'
      ? 'cancelled'
      : !invoice.is_valid
        ? 'rectified'
        : 'valid';
    const operationDate = resolveOperationDate(invoice);
    const effectivePsycmaValidity = fiscalStatus === 'cancelled' ? false : invoice.is_valid;

    const records = recordsByInvoice.get(invoice.id) || [];
    const events = eventsByInvoice.get(invoice.id) || [];
    const altaRecord = records.find((record) => record.record_type === 'alta');
    const rowRecords: Array<AccountingVerifactuRecord | undefined> =
      records.length > 0 ? records : [undefined];

    return rowRecords.map((record) => {
      const event = findRecordEvent(record, events);
      const fiscalXml = (record?.record_type === 'alta' ? record.xml_sent : altaRecord?.xml_sent)
        || record?.xml_sent
        || '';
      const xmlQualification = extractXmlValue(fiscalXml, 'CalificacionOperacion');
      const exemptionCode = extractXmlValue(fiscalXml, 'OperacionExenta');
      const inferredVatRate = invoice.tax_rate
        ?? invoice.invoice_items.find((item) => item.tax_rate !== null && item.tax_rate !== undefined)?.tax_rate
        ?? 0;
      const isCancellation = record?.record_type === 'anulacion';

      return {
        invoice_number: invoice.invoice_number || '',
        invoice_date: invoice.issue_date || '',
        due_date: invoice.due_date || '',
        operation_date: operationDate,
        description,
        client_name: clientName,
        client_tax_id: clientTaxId,
        client_address: snapshot?.address?.trim() || patient?.address || '',
        client_city: snapshot?.city?.trim() || patient?.city || '',
        client_postal_code: snapshot?.postal_code?.trim() || patient?.postal_code || '',
        client_email: snapshot?.email?.trim() || patient?.email || '',
        client_country: 'ES',
        fiscal_recipient_source: recipientSource,
        fiscal_invoice_type: fiscalInvoiceType,
        correction_kind: correctionKind,
        rectification_type: normalizeRectificationType(invoice.rectification_type),
        rectification_reason_code: invoice.rectification_reason_code || '',
        replaced_invoice_numbers: references.map((reference) => reference.invoice_number).join('; '),
        replaced_invoice_dates: references.map((reference) => reference.issue_date).filter(Boolean).join('; '),
        net_amount: formatDecimal(netAmount),
        vat_amount: formatDecimal(vatAmount),
        irpf_retention: formatDecimal(retentionAmount),
        total_amount: formatDecimal(netAmount + vatAmount - retentionAmount),
        currency: 'EUR',
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        payment_date: paymentDates[paymentDates.length - 1] || '',
        payment_notes: paymentNotes,
        vat_zone: '',
        vat_due_mode: '',
        import_format: 'psycma',
        psycma_invoice_id: invoice.id,
        psycma_center_id: invoice.center_id,
        psycma_series_id: invoice.series_id || '',
        psycma_status: invoice.status || '',
        psycma_is_valid: effectivePsycmaValidity ? 'true' : 'false',
        psycma_correction_operation_id: invoice.correction_operation_id || '',
        export_schema_version: '2',
        invoice_series: invoice.series?.name || '',
        vat_rate: formatDecimal(Number(inferredVatRate) || 0),
        operation_qualification: xmlQualification,
        tax_exemption_code: exemptionCode,
        fiscal_status: fiscalStatus,
        verifactu_record_type: record?.record_type || '',
        cancellation_date: fiscalStatus === 'cancelled'
          ? invoice.cancellation_date || (isCancellation ? record.created_at.slice(0, 10) : '')
          : '',
        cancellation_reason: fiscalStatus === 'cancelled' ? invoice.cancellation_reason || '' : '',
        rectified_psycma_invoice_ids: references.map((reference) => reference.id).filter(Boolean).join('; '),
        verifactu_generated_at: record?.record_type === 'alta'
          ? invoice.verifactu_timestamp || record.created_at
          : record?.created_at || invoice.verifactu_timestamp || '',
        verifactu_sent_at: event?.created_at || '',
        verifactu_submission_status: normalizeSubmissionStatus(invoice, record, event),
        verifactu_hash: record?.hash || invoice.verifactu_hash || invoice.invoice_hash || '',
        previous_record_hash: record?.previous_hash || invoice.previous_invoice_hash || '',
        aeat_response_code: event?.aeat_response_code || '',
        aeat_csv: record?.aeat_csv || event?.aeat_csv || invoice.verifactu_registration_id || '',
      };
    });
  });
}

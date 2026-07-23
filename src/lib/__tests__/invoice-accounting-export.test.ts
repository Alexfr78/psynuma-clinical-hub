import { describe, expect, it } from 'vitest';
import { buildCsv } from '@/lib/export/buildCsv';
import {
  buildInvoiceAccountingRows,
  INVOICE_CSV_COLUMNS,
  type AccountingExportInvoice,
  type AccountingVerifactuEvent,
  type AccountingVerifactuRecord,
} from '@/lib/export/invoiceAccountingExport';

function makeInvoice(
  overrides: Partial<AccountingExportInvoice> = {},
): AccountingExportInvoice {
  return {
    id: 'invoice-new',
    invoice_number: 'FC-2026-001',
    issue_date: '2026-07-23',
    due_date: '2026-07-23',
    operation_date: null,
    subtotal: 100,
    tax_rate: 0,
    tax_amount: 0,
    retention_amount: 0,
    total: 100,
    notes: null,
    status: 'issued',
    is_valid: true,
    series_id: 'series-complete',
    center_id: 'center-1',
    patients: {
      first_name: 'Nombre actual',
      last_name: 'Contacto',
      tax_id: '00000000T',
      address: 'Dirección actual',
      city: 'Madrid',
      postal_code: '28001',
      email: 'actual@example.com',
    },
    series: {
      name: 'SF',
      invoice_type: 'complete',
      series_type: 'ordinary',
    },
    invoice_items: [{
      description: 'Sesión clínica',
      quantity: 1,
      unit_price: 100,
      total: 100,
      tax_rate: 0,
    }],
    payments: [],
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<AccountingVerifactuRecord> = {},
): AccountingVerifactuRecord {
  return {
    id: 'record-alta',
    invoice_id: 'invoice-new',
    record_type: 'alta',
    hash: 'persisted-alta-hash',
    previous_hash: 'persisted-previous-hash',
    aeat_status: 'accepted',
    aeat_csv: 'CSV-ALTA',
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    xml_sent: [
      '<DetalleDesglose>',
      '<OperacionExenta>E1</OperacionExenta>',
      '<BaseImponibleOimporteNoSujeto>100.00</BaseImponibleOimporteNoSujeto>',
      '</DetalleDesglose>',
    ].join(''),
    created_at: '2026-07-23T10:01:00+02:00',
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<AccountingVerifactuEvent> = {},
): AccountingVerifactuEvent {
  return {
    invoice_id: 'invoice-new',
    event_type: 'alta',
    aeat_csv: 'CSV-ALTA',
    aeat_response_code: null,
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    error_details: null,
    created_at: '2026-07-23T10:00:59+02:00',
    ...overrides,
  };
}

describe('buildInvoiceAccountingRows', () => {
  it('preserves the 23 v1 columns and appends the 22 v2 columns in exact order', () => {
    expect(INVOICE_CSV_COLUMNS.map((column) => column.header)).toEqual([
      'invoice_number', 'invoice_date', 'due_date', 'description', 'client_name',
      'client_tax_id', 'client_country', 'net_amount', 'vat_amount', 'irpf_retention',
      'total_amount', 'currency', 'payment_status', 'payment_method', 'payment_date',
      'payment_notes', 'vat_zone', 'vat_due_mode', 'import_format', 'psycma_invoice_id',
      'psycma_center_id', 'psycma_series_id', 'psycma_status',
      'export_schema_version', 'invoice_series', 'invoice_type', 'fiscal_status',
      'verifactu_record_type', 'operation_date', 'vat_rate', 'operation_qualification',
      'tax_exemption_code', 'rectification_type', 'rectified_invoice_number',
      'rectified_invoice_date', 'rectified_psycma_invoice_id', 'cancellation_date',
      'cancellation_reason', 'verifactu_generated_at', 'verifactu_sent_at',
      'verifactu_submission_status', 'verifactu_hash', 'previous_record_hash',
      'aeat_response_code', 'aeat_csv',
    ]);
  });

  it('classifies F1 with NIF and a qualified simplified invoice as F1', () => {
    const complete = buildInvoiceAccountingRows([makeInvoice()], [])[0];
    const qualifiedSimplified = buildInvoiceAccountingRows([
      makeInvoice({ series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' } }),
    ], [])[0];

    expect(complete).toMatchObject({ invoice_type: 'F1', invoice_series: 'SF' });
    expect(qualifiedSimplified).toMatchObject({ invoice_type: 'F1', invoice_series: 'SP' });
  });

  it('classifies a simplified invoice without NIF as F2', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        patients: { first_name: 'Cliente', last_name: 'Anónimo', tax_id: null },
        series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' },
      }),
    ], [])[0];

    expect(row.invoice_type).toBe('F2');
  });

  it('exports an exempt healthcare invoice with explicit zero VAT and E1', () => {
    const row = buildInvoiceAccountingRows(
      [makeInvoice()],
      [],
      [makeRecord()],
      [makeEvent()],
    )[0];

    expect(row).toMatchObject({
      export_schema_version: '2',
      vat_rate: '0',
      operation_qualification: '',
      tax_exemption_code: 'E1',
      verifactu_submission_status: 'accepted',
    });
  });

  it('exports a negative rectificativa referencing the original invoice', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'RS-2026-002',
        subtotal: -100,
        tax_amount: 0,
        retention_amount: 0,
        total: -100,
        verifactu_invoice_type: 'R1',
        rectified_invoice_id: 'invoice-original',
        rectification_type: 'differences',
        rectified_invoice: {
          id: 'invoice-original',
          invoice_number: 'SF-2026-001',
          issue_date: '2026-07-20',
        },
      }),
    ], [])[0];

    expect(row).toMatchObject({
      invoice_type: 'R1',
      fiscal_status: 'valid',
      rectification_type: 'I',
      rectified_invoice_number: 'SF-2026-001',
      rectified_invoice_date: '2026-07-20',
      rectified_psycma_invoice_id: 'invoice-original',
      total_amount: '-100',
    });
  });

  it('exports a substitution rectificativa as S', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        verifactu_invoice_type: 'R4',
        rectified_invoice_id: 'invoice-original',
        rectification_type: 'substitution',
        rectified_invoice: {
          id: 'invoice-original',
          invoice_number: 'SF-2026-001',
          issue_date: '2026-07-20',
        },
      }),
    ], [])[0];

    expect(row.rectification_type).toBe('S');
  });

  it('keeps a cancelled invoice and emits both alta and anulacion records', () => {
    const records = [
      makeRecord(),
      makeRecord({
        id: 'record-cancel',
        record_type: 'anulacion',
        hash: 'persisted-cancel-hash',
        previous_hash: 'persisted-alta-hash',
        aeat_csv: 'CSV-CANCEL',
        xml_sent: '<RegistroFacturacionAnulacion />',
        created_at: '2026-07-24T12:00:01+02:00',
      }),
    ];
    const events = [
      makeEvent(),
      makeEvent({
        event_type: 'anulacion',
        aeat_csv: 'CSV-CANCEL',
        created_at: '2026-07-24T12:00:00+02:00',
      }),
    ];

    const rows = buildInvoiceAccountingRows(
      [makeInvoice({
        status: 'cancelled',
        cancellation_date: '2026-07-24',
        cancellation_reason: 'Factura emitida por duplicado',
      })],
      [],
      records,
      events,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.verifactu_record_type)).toEqual(['alta', 'anulacion']);
    expect(rows.every((row) => row.fiscal_status === 'cancelled')).toBe(true);
    expect(rows[1]).toMatchObject({
      cancellation_date: '2026-07-24',
      cancellation_reason: 'Factura emitida por duplicado',
      verifactu_hash: 'persisted-cancel-hash',
      previous_record_hash: 'persisted-alta-hash',
      aeat_csv: 'CSV-CANCEL',
    });
  });

  it('quotes text and preserves a comma, quotes, accents and newlines as RFC 4180', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        patients: {
          first_name: 'García, Ana "Luz"',
          last_name: '',
          tax_id: '00000000T',
        },
        notes: 'Línea uno\nLínea dos',
        invoice_items: [],
      }),
    ], [])[0];
    const csv = buildCsv([row], INVOICE_CSV_COLUMNS, { quoteAllText: true });

    expect(csv).toContain('"García, Ana ""Luz"""');
    expect(csv).toContain('"Línea uno\nLínea dos"');
    expect(csv.split('\r\n')[0]).toContain('"invoice_number"');
  });

  it('maps an AEAT rejection to the stable rejected status and response code', () => {
    const row = buildInvoiceAccountingRows(
      [makeInvoice()],
      [],
      [],
      [makeEvent({
        event_type: 'error',
        aeat_csv: null,
        aeat_response_code: '1238',
        aeat_response_xml: '<EstadoRegistro>Incorrecto</EstadoRegistro>',
        error_details: 'Desglose incorrecto',
      })],
    )[0];

    expect(row).toMatchObject({
      verifactu_submission_status: 'rejected',
      aeat_response_code: '1238',
    });
  });

  it('exports twice without changing permanent identifiers or persisted hashes', () => {
    const invoice = makeInvoice();
    const record = makeRecord();
    const first = buildInvoiceAccountingRows([invoice], [], [record], [makeEvent()]);
    const second = buildInvoiceAccountingRows([invoice], [], [record], [makeEvent()]);

    expect(second).toEqual(first);
    expect(second[0]).toMatchObject({
      psycma_invoice_id: 'invoice-new',
      verifactu_hash: 'persisted-alta-hash',
      previous_record_hash: 'persisted-previous-hash',
    });
  });
});

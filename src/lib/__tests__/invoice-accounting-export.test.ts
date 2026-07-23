import { describe, expect, it } from 'vitest';
import { buildCsv } from '@/lib/export/buildCsv';
import {
  buildInvoiceAccountingRows,
  createInvoiceAccountingExport,
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

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  const input = csv.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      record.push(field);
      field = '';
    } else if (character === '\r' && input[index + 1] === '\n' && !quoted) {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      index += 1;
    } else {
      field += character;
    }
  }

  record.push(field);
  records.push(record);
  return records;
}

describe('buildInvoiceAccountingRows', () => {
  it('preserves the 37 existing columns and appends the 17 v2 columns in exact order', () => {
    expect(INVOICE_CSV_COLUMNS.map((column) => column.header)).toEqual([
      'invoice_number', 'invoice_date', 'due_date', 'description', 'client_name',
      'client_tax_id', 'client_country', 'net_amount', 'vat_amount', 'irpf_retention',
      'total_amount', 'currency', 'payment_status', 'payment_method', 'payment_date',
      'payment_notes', 'vat_zone', 'vat_due_mode', 'import_format', 'psycma_invoice_id',
      'psycma_center_id', 'psycma_series_id', 'psycma_status',
      'operation_date', 'client_address', 'client_city', 'client_postal_code',
      'client_email', 'fiscal_recipient_source', 'fiscal_invoice_type',
      'correction_kind', 'rectification_type', 'rectification_reason_code',
      'replaced_invoice_numbers', 'replaced_invoice_dates', 'psycma_is_valid',
      'psycma_correction_operation_id',
      'export_schema_version', 'invoice_series', 'vat_rate', 'operation_qualification',
      'tax_exemption_code', 'fiscal_status', 'verifactu_record_type',
      'cancellation_date', 'cancellation_reason', 'rectified_psycma_invoice_ids',
      'verifactu_generated_at', 'verifactu_sent_at',
      'verifactu_submission_status', 'verifactu_hash', 'previous_record_hash',
      'aeat_response_code', 'aeat_csv',
    ]);
    expect(INVOICE_CSV_COLUMNS).toHaveLength(54);
  });

  it.each([
    { includeCancelled: false, includeDrafts: false },
    { includeCancelled: true, includeDrafts: false },
    { includeCancelled: false, includeDrafts: true },
    { includeCancelled: true, includeDrafts: true },
  ])(
    'uses the identical 54-column generator with options %o',
    (options) => {
      const invoices = [
        makeInvoice({ id: 'valid-invoice', invoice_number: 'SF260001' }),
        makeInvoice({
          id: 'cancelled-invoice',
          invoice_number: 'SP260011',
          status: 'cancelled',
        }),
        makeInvoice({
          id: 'draft-invoice',
          invoice_number: 'BORRADOR-1',
          status: 'draft',
        }),
      ];

      const result = createInvoiceAccountingExport(invoices, [], [], [], options);
      const records = parseCsvRecords(result.csv);

      expect(records[0]).toEqual(INVOICE_CSV_COLUMNS.map((column) => column.header));
      expect(records.every((record) => record.length === 54)).toBe(true);
      expect(result.rows.some((row) => row.invoice_number === 'SP260011'))
        .toBe(options.includeCancelled);
      expect(result.rows.some((row) => row.invoice_number === 'BORRADOR-1'))
        .toBe(options.includeDrafts);
    },
  );

  it('classifies F1 with fiscal NIF and address captured on the invoice', () => {
    const complete = buildInvoiceAccountingRows([
      makeInvoice({
        recipient_snapshot: {
          name: 'Paciente Fiscal',
          tax_id: '00000000T',
          address: 'Calle Fiscal 1',
          city: 'Madrid',
          postal_code: '28001',
        },
      }),
    ], [])[0];
    const qualifiedSimplified = buildInvoiceAccountingRows([
      makeInvoice({
        recipient_snapshot: {
          name: 'Paciente Fiscal',
          tax_id: '00000000T',
          address: 'Calle Fiscal 1',
        },
        series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' },
      }),
    ], [])[0];

    expect(complete).toMatchObject({
      fiscal_invoice_type: 'F1',
      fiscal_recipient_source: 'invoice',
      client_address: 'Calle Fiscal 1',
      invoice_series: 'SF',
    });
    expect(qualifiedSimplified).toMatchObject({
      fiscal_invoice_type: 'F1',
      fiscal_recipient_source: 'invoice',
      invoice_series: 'SP',
    });
  });

  it('classifies a simplified invoice without NIF as F2', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        patients: { first_name: 'Cliente', last_name: 'Anónimo', tax_id: null },
        series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' },
      }),
    ], [])[0];

    expect(row).toMatchObject({
      fiscal_invoice_type: 'F2',
      verifactu_record_type: 'alta',
    });
  });

  it.each(['F1', 'F2', 'F3'] as const)(
    'exports an accepted %s invoice as an alta when historical record_type is absent',
    (fiscalType) => {
      const row = buildInvoiceAccountingRows([
        makeInvoice({
          verifactu_invoice_type: fiscalType,
          verifactu_registration_id: `CSV-${fiscalType}`,
          verifactu_hash: `HASH-${fiscalType}`,
        }),
      ], [])[0];

      expect(row).toMatchObject({
        fiscal_invoice_type: fiscalType,
        verifactu_record_type: 'alta',
        verifactu_submission_status: 'accepted',
        aeat_csv: `CSV-${fiscalType}`,
        verifactu_hash: `HASH-${fiscalType}`,
      });
    },
  );

  it('preserves accepted metadata from a historical alta record whose record_type is empty', () => {
    const row = buildInvoiceAccountingRows(
      [makeInvoice({ verifactu_timestamp: '2026-03-01T10:00:00+01:00' })],
      [],
      [makeRecord({
        record_type: '',
        hash: 'HISTORICAL-HASH',
        previous_hash: 'HISTORICAL-PREVIOUS-HASH',
        aeat_csv: 'HISTORICAL-CSV',
      })],
      [makeEvent()],
    )[0];

    expect(row).toMatchObject({
      verifactu_record_type: 'alta',
      verifactu_generated_at: '2026-03-01T10:00:00+01:00',
      verifactu_submission_status: 'accepted',
      verifactu_hash: 'HISTORICAL-HASH',
      previous_record_hash: 'HISTORICAL-PREVIOUS-HASH',
      aeat_csv: 'HISTORICAL-CSV',
    });
  });

  it.each(['R1', 'R2', 'R3', 'R4', 'R5'] as const)(
    'exports an accepted %s rectificativa as an alta',
    (fiscalType) => {
      const simplified = fiscalType === 'R5';
      const row = buildInvoiceAccountingRows([
        makeInvoice({
          invoice_number: `${simplified ? 'RP' : 'RS'}-${fiscalType}`,
          verifactu_invoice_type: fiscalType,
          rectification_reason_code: fiscalType,
          rectified_invoice_id: `original-${fiscalType}`,
          rectified_invoice: {
            id: `original-${fiscalType}`,
            invoice_number: `${simplified ? 'SP' : 'SF'}-${fiscalType}`,
            issue_date: '2026-06-01',
            series: {
              name: simplified ? 'SP' : 'SF',
              invoice_type: simplified ? 'simplified' : 'complete',
            },
          },
          verifactu_registration_id: `CSV-${fiscalType}`,
        }),
      ], [])[0];

      expect(row).toMatchObject({
        fiscal_invoice_type: fiscalType,
        fiscal_status: 'valid',
        verifactu_record_type: 'alta',
        verifactu_submission_status: 'accepted',
      });
    },
  );

  it('keeps a rectified original in the fiscal history as an alta, not an anulacion', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'SF260053',
        is_valid: false,
        verifactu_registration_id: 'CSV-ORIGINAL',
      }),
    ], [])[0];

    expect(row).toMatchObject({
      psycma_is_valid: 'false',
      fiscal_status: 'rectified',
      verifactu_record_type: 'alta',
    });
  });

  it('does not turn F2 into F1 when the NIF exists only on the contact', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        recipient_snapshot: null,
        patients: {
          first_name: 'Contacto',
          last_name: 'Con NIF',
          tax_id: '00000000T',
          address: 'Calle del contacto 2',
        },
        series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' },
      }),
    ], [])[0];

    expect(row).toMatchObject({
      fiscal_invoice_type: 'F2',
      fiscal_recipient_source: 'contact',
      client_tax_id: '00000000T',
    });
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

  it('always exports total_amount using the accounting equation', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        subtotal: 100,
        tax_amount: 21,
        retention_amount: 15,
        total: 999,
      }),
    ], [])[0];

    expect(row).toMatchObject({
      net_amount: '100',
      vat_amount: '21',
      irpf_retention: '15',
      total_amount: '106',
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
      fiscal_invoice_type: 'R1',
      fiscal_status: 'valid',
      correction_kind: 'rectificativa_differences',
      rectification_type: 'I',
      replaced_invoice_numbers: 'SF-2026-001',
      replaced_invoice_dates: '2026-07-20',
      rectified_psycma_invoice_ids: 'invoice-original',
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

    expect(row).toMatchObject({
      fiscal_invoice_type: 'R4',
      correction_kind: 'rectificativa_substitution',
      rectification_type: 'S',
    });
  });

  it('keeps a positive simplified rectificativa classified as R5', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'RP260001',
        subtotal: 25,
        total: 25,
        verifactu_invoice_type: 'R5',
        rectified_invoice_id: 'invoice-sp-original',
        rectification_type: 'differences',
        series: { name: 'RP', invoice_type: 'simplified', series_type: 'rectifying' },
        rectified_invoice: {
          id: 'invoice-sp-original',
          invoice_number: 'SP260001',
          issue_date: '2026-07-01',
        },
      }),
    ], [])[0];

    expect(row).toMatchObject({
      fiscal_invoice_type: 'R5',
      invoice_series: 'RP',
      correction_kind: 'rectificativa_differences',
      rectification_type: 'I',
      total_amount: '25',
    });
  });

  it('preserves the original invoice IDs for historical RP and RS rectificativas', () => {
    const mappings = [
      ['RP260001', 'SP260004', 'original-sp-260004', 'R5'],
      ['RP260002', 'SP260022', 'original-sp-260022', 'R5'],
      ['RS260002', 'SF260053', 'original-sf-260053', 'R1'],
      ['RP260003', 'SP260033', 'original-sp-260033', 'R5'],
      ['RS260003', 'SF260087', 'original-sf-260087', 'R4'],
    ] as const;
    const invoices = mappings.map(([number, replacedNumber, replacedId, fiscalType]) =>
      makeInvoice({
        id: `rectifying-${number}`,
        invoice_number: number,
        verifactu_invoice_type: fiscalType,
        rectified_invoice_id: replacedId,
        rectification_type: fiscalType === 'R4' ? 'substitution' : 'differences',
        correction_operation_id: `operation-${number}`,
        rectified_invoice: {
          id: replacedId,
          invoice_number: replacedNumber,
          issue_date: '2026-06-01',
        },
        series: {
          name: number.startsWith('RP') ? 'RP' : 'RS',
          invoice_type: number.startsWith('RP') ? 'simplified' : 'complete',
          series_type: 'rectifying',
        },
      }),
    );

    const rows = buildInvoiceAccountingRows(invoices, []);

    expect(rows).toHaveLength(mappings.length);
    mappings.forEach(([number, replacedNumber, replacedId, fiscalType]) => {
      expect(rows.find((row) => row.invoice_number === number)).toMatchObject({
        fiscal_invoice_type: fiscalType,
        replaced_invoice_numbers: replacedNumber,
        rectified_psycma_invoice_ids: replacedId,
        psycma_correction_operation_id: `operation-${number}`,
      });
    });
  });

  it('never exports R5 for a complete original when no valid R1-R4 cause is stored', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'RS260002',
        verifactu_invoice_type: 'R5',
        rectification_reason_code: 'R5',
        rectified_invoice_id: 'original-sf-260053',
        rectified_invoice: {
          id: 'original-sf-260053',
          invoice_number: 'SF260053',
          issue_date: '2026-04-21',
          series: { name: 'SF', invoice_type: 'complete' },
        },
        series: { name: 'RS', invoice_type: 'complete', series_type: 'rectifying' },
      }),
    ], [])[0];

    expect(row).toMatchObject({
      fiscal_invoice_type: '',
      rectification_reason_code: '',
      replaced_invoice_numbers: 'SF260053',
      rectified_psycma_invoice_ids: 'original-sf-260053',
    });
  });

  it('keeps a cancelled invoice and exports only its canonical anulacion record', () => {
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
        invoice_number: 'SP260011',
        status: 'cancelled',
        series: { name: 'SP', invoice_type: 'simplified', series_type: 'ordinary' },
        cancellation_date: '2026-07-24',
        cancellation_reason: 'Factura emitida por duplicado',
      })],
      [],
      records,
      events,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoice_number: 'SP260011',
      psycma_status: 'cancelled',
      psycma_is_valid: 'false',
      fiscal_status: 'cancelled',
      verifactu_record_type: 'anulacion',
      export_schema_version: '2',
      invoice_series: 'SP',
      vat_rate: '0',
      tax_exemption_code: 'E1',
      cancellation_date: '2026-07-24',
      cancellation_reason: 'Factura emitida por duplicado',
      verifactu_hash: 'persisted-cancel-hash',
      previous_record_hash: 'persisted-alta-hash',
      aeat_csv: 'CSV-CANCEL',
    });
  });

  it('does not reuse alta metadata when a cancelled invoice has no anulacion record', () => {
    const row = buildInvoiceAccountingRows(
      [makeInvoice({
        invoice_number: 'SP260011',
        status: 'cancelled',
        invoice_hash: 'legacy-alta-invoice-hash',
        previous_invoice_hash: 'legacy-alta-previous-hash',
        verifactu_hash: 'legacy-alta-verifactu-hash',
        verifactu_registration_id: 'LEGACY-ALTA-CSV',
        verifactu_timestamp: '2026-03-02T10:00:00+01:00',
      })],
      [],
      [makeRecord({
        record_type: 'alta',
        hash: 'canonical-alta-hash',
        aeat_csv: 'CANONICAL-ALTA-CSV',
      })],
      [makeEvent({
        event_type: 'anulacion',
        aeat_csv: null,
        aeat_response_xml: null,
        created_at: '2026-03-07T09:33:51+00:00',
      })],
    )[0];

    expect(row).toMatchObject({
      verifactu_record_type: 'anulacion',
      verifactu_generated_at: '',
      verifactu_sent_at: '2026-03-07T09:33:51+00:00',
      verifactu_submission_status: '',
      verifactu_hash: '',
      previous_record_hash: '',
      aeat_csv: '',
    });
  });

  it('does not infer anulacion from an unrelated historical error timestamp', () => {
    const row = buildInvoiceAccountingRows(
      [makeInvoice({
        invoice_number: 'SP260011',
        status: 'cancelled',
      })],
      [],
      [makeRecord({ record_type: 'alta' })],
      [makeEvent({
        event_type: 'error',
        aeat_response_code: null,
        aeat_response_xml: null,
        aeat_csv: null,
        created_at: '2026-03-07T09:33:51.090611+00:00',
      })],
    )[0];

    expect(row).toMatchObject({
      fiscal_status: 'cancelled',
      psycma_is_valid: 'false',
      verifactu_record_type: '',
      verifactu_generated_at: '',
      verifactu_sent_at: '2026-03-07T09:33:51.090611+00:00',
      verifactu_submission_status: '',
      verifactu_hash: '',
      previous_record_hash: '',
      aeat_response_code: '',
      aeat_csv: '',
    });
  });

  it('uses the linked session date for SF260097 instead of copying the issue date', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'SF260097',
        issue_date: '2026-07-20',
        operation_date: '2026-07-20',
        invoice_items: [{
          description: 'Sesión clínica del 6 de julio',
          quantity: 1,
          unit_price: 100,
          total: 100,
          tax_rate: 0,
          session_id: 'session-6-july',
          session: { session_date: '2026-07-06' },
        }],
      }),
    ], [])[0];

    expect(row.operation_date).toBe('2026-07-06');
    expect(row.invoice_date).toBe('2026-07-20');
  });

  it('uses the bono sale timestamp as operation date for a bono invoice', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        issue_date: '2026-07-20',
        invoice_items: [{
          description: 'Bono de sesiones',
          quantity: 1,
          unit_price: 100,
          total: 100,
          tax_rate: 0,
          bono_id: 'bono-1',
          bono: { created_at: '2026-07-18T09:15:00+02:00' },
        }],
      }),
    ], [])[0];

    expect(row.operation_date).toBe('2026-07-18');
  });

  it('quotes text and preserves a comma, quotes, accents and newlines as RFC 4180', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        patients: {
          first_name: 'García, Ana "Luz"',
          last_name: '',
          tax_id: '00000000T',
          address: 'Calle "Mayor", 10',
        },
        notes: 'Línea uno\nLínea dos',
        invoice_items: [],
      }),
    ], [])[0];
    const csv = buildCsv([row], INVOICE_CSV_COLUMNS, { quoteAllText: true });

    expect(csv).toContain('"García, Ana ""Luz"""');
    expect(csv).toContain('"Calle ""Mayor"", 10"');
    expect(csv).toContain('"Línea uno\nLínea dos"');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')[0]).toContain('"invoice_number"');

    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(2);
    expect(records[0]).toHaveLength(INVOICE_CSV_COLUMNS.length);
    expect(records[1]).toHaveLength(INVOICE_CSV_COLUMNS.length);
  });

  it('leaves fiscal and Verifactu evidence empty when it is not stored', () => {
    const row = buildInvoiceAccountingRows([
      makeInvoice({
        tax_rate: 0,
        tax_amount: 0,
        operation_date: null,
        invoice_items: [{
          description: 'Servicio sin desglose fiscal persistido',
          quantity: 1,
          unit_price: 100,
          total: 100,
          tax_rate: 0,
        }],
      }),
    ], [])[0];

    expect(row).toMatchObject({
      operation_date: '',
      operation_qualification: '',
      tax_exemption_code: '',
      verifactu_record_type: 'alta',
      verifactu_submission_status: '',
      verifactu_hash: '',
      previous_record_hash: '',
      aeat_response_code: '',
      aeat_csv: '',
    });
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
      verifactu_record_type: 'alta',
      verifactu_submission_status: 'rejected',
      aeat_response_code: '1238',
      aeat_csv: '',
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

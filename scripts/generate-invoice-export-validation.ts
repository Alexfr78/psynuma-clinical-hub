import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  createInvoiceAccountingExport,
  type AccountingExportInvoice,
  type AccountingVerifactuEvent,
  type AccountingVerifactuRecord,
} from '../src/lib/export/invoiceAccountingExport.ts';

const outputPath = resolve(
  process.cwd(),
  'validation',
  'invoice-export-2026-02-01-to-2026-07-25-v2.csv',
);

function invoice(
  id: string,
  invoiceNumber: string,
  seriesName: string,
  overrides: Partial<AccountingExportInvoice> = {},
): AccountingExportInvoice {
  return {
    id,
    invoice_number: invoiceNumber,
    issue_date: '2026-07-18',
    due_date: '2026-07-18',
    operation_date: null,
    subtotal: 100,
    tax_rate: 0,
    tax_amount: 0,
    retention_amount: 0,
    total: 100,
    notes: null,
    status: 'issued',
    is_valid: true,
    series_id: `validation-series-${seriesName}`,
    center_id: 'validation-center',
    recipient_snapshot: null,
    patients: {
      first_name: 'Cliente',
      last_name: 'de validación',
      tax_id: null,
      address: null,
      city: null,
      postal_code: null,
      email: null,
    },
    series: {
      name: seriesName,
      invoice_type: seriesName === 'SP' || seriesName === 'RP' ? 'simplified' : 'complete',
      series_type: seriesName === 'RP' || seriesName === 'RS' ? 'rectifying' : 'ordinary',
    },
    invoice_items: [{
      description: 'Línea de validación',
      quantity: 1,
      unit_price: 100,
      total: 100,
      tax_rate: 0,
    }],
    payments: [],
    ...overrides,
  };
}

function rectifyingInvoice(
  invoiceNumber: string,
  seriesName: 'RP' | 'RS',
  originalNumber: string,
  originalId: string,
  storedFiscalType: 'R1' | 'R4' | 'R5',
): AccountingExportInvoice {
  const originalInvoiceType = originalNumber.startsWith('SP') ? 'simplified' : 'complete';
  return invoice(`validation-${invoiceNumber}`, invoiceNumber, seriesName, {
    verifactu_invoice_type: storedFiscalType,
    rectified_invoice_id: originalId,
    rectification_type: storedFiscalType === 'R4' ? 'substitution' : 'differences',
    rectification_reason_code: storedFiscalType,
    correction_operation_id: `validation-operation-${invoiceNumber}`,
    rectified_invoice: {
      id: originalId,
      invoice_number: originalNumber,
      issue_date: '2026-06-01',
      series: {
        name: originalNumber.slice(0, 2),
        invoice_type: originalInvoiceType,
      },
    },
  });
}

const invoices: AccountingExportInvoice[] = [
  invoice('validation-sf-260097', 'SF260097', 'SF', {
    recipient_snapshot: {
      name: 'Cliente Fiscal, "Validación"',
      tax_id: '00000000T',
      address: 'Calle Prueba, 1',
      city: 'Madrid',
      postal_code: '28001',
    },
    invoice_items: [{
      description: 'Sesión clínica del 6 de julio',
      quantity: 1,
      unit_price: 100,
      total: 100,
      tax_rate: 0,
      session_id: 'validation-session-2026-07-06',
      session: { session_date: '2026-07-06' },
    }],
  }),
  invoice('validation-sp', 'SP-VALIDATION-001', 'SP'),
  rectifyingInvoice('RP260001', 'RP', 'SP260004', 'validation-original-SP260004', 'R5'),
  rectifyingInvoice('RP260002', 'RP', 'SP260022', 'validation-original-SP260022', 'R5'),
  // These mirror the invalid historic R5 value found on complete rectifications.
  // The exporter must leave the fiscal cause empty instead of inventing R1-R4.
  rectifyingInvoice('RS260002', 'RS', 'SF260053', 'validation-original-SF260053', 'R5'),
  rectifyingInvoice('RP260003', 'RP', 'SP260033', 'validation-original-SP260033', 'R5'),
  rectifyingInvoice('RS260003', 'RS', 'SF260087', 'validation-original-SF260087', 'R5'),
  invoice('validation-sp-260011', 'SP260011', 'SP', {
    status: 'cancelled',
    is_valid: false,
    cancellation_date: '2026-07-18',
    cancellation_reason: 'Motivo almacenado de validación',
  }),
];

const records: AccountingVerifactuRecord[] = [
  ...invoices
    .filter((invoice) => invoice.status !== 'cancelled')
    .map((invoice, index) => ({
      id: `validation-untyped-alta-${invoice.id}`,
      invoice_id: invoice.id,
      record_type: '',
      hash: `VALIDATION_ONLY_ALTA_HASH_${index + 1}`,
      previous_hash: index === 0 ? null : `VALIDATION_ONLY_ALTA_HASH_${index}`,
      aeat_status: 'accepted',
      aeat_csv: `VALIDATION_ONLY_ALTA_CSV_${index + 1}`,
      aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
      xml_sent: '<RegistroFacturacionAlta><OperacionExenta>E1</OperacionExenta></RegistroFacturacionAlta>',
      created_at: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00+02:00`,
    })),
  {
    id: 'validation-sp-260011-alta',
    invoice_id: 'validation-sp-260011',
    record_type: 'alta',
    hash: 'VALIDATION_ONLY_ALTA_HASH',
    previous_hash: null,
    aeat_status: 'accepted',
    aeat_csv: 'VALIDATION_ONLY_ALTA_CSV',
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    xml_sent: '<RegistroFacturacionAlta><OperacionExenta>E1</OperacionExenta></RegistroFacturacionAlta>',
    created_at: '2026-07-17T10:00:00+02:00',
  },
  {
    id: 'validation-sp-260011-anulacion',
    invoice_id: 'validation-sp-260011',
    record_type: 'anulacion',
    hash: 'VALIDATION_ONLY_CANCELLATION_HASH',
    previous_hash: 'VALIDATION_ONLY_ALTA_HASH',
    aeat_status: 'accepted',
    aeat_csv: 'VALIDATION_ONLY_CANCELLATION_CSV',
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    xml_sent: '<RegistroFacturacionAnulacion />',
    created_at: '2026-07-18T12:00:00+02:00',
  },
];

const events: AccountingVerifactuEvent[] = [
  {
    invoice_id: 'validation-sp-260011',
    event_type: 'alta',
    aeat_csv: 'VALIDATION_ONLY_ALTA_CSV',
    aeat_response_code: null,
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    error_details: null,
    created_at: '2026-07-17T10:00:00+02:00',
  },
  {
    invoice_id: 'validation-sp-260011',
    event_type: 'anulacion',
    aeat_csv: 'VALIDATION_ONLY_CANCELLATION_CSV',
    aeat_response_code: null,
    aeat_response_xml: '<EstadoRegistro>Correcto</EstadoRegistro>',
    error_details: null,
    created_at: '2026-07-18T12:00:00+02:00',
  },
];

const { rows, csv } = createInvoiceAccountingExport(
  invoices,
  [],
  records,
  events,
  {
    includeCancelled: true,
    includeDrafts: false,
  },
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, csv, 'utf8');

console.log(`Generated ${rows.length} validation rows at ${outputPath}`);

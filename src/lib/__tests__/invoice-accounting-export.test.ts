import { describe, expect, it } from 'vitest';
import {
  buildInvoiceAccountingRows,
  INVOICE_CSV_COLUMNS,
  type AccountingExportInvoice,
} from '@/lib/export/invoiceAccountingExport';

function makeInvoice(
  overrides: Partial<AccountingExportInvoice> = {},
): AccountingExportInvoice {
  return {
    id: 'invoice-new',
    invoice_number: 'FC-2026-001',
    issue_date: '2026-07-23',
    due_date: '2026-07-23',
    subtotal: 100,
    tax_amount: 0,
    retention_amount: 0,
    total: 100,
    notes: null,
    status: 'paid',
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
      invoice_type: 'complete',
      series_type: 'ordinary',
    },
    invoice_items: [{
      description: 'Sesión clínica',
      quantity: 1,
      unit_price: 100,
      total: 100,
    }],
    payments: [{
      amount: 100,
      payment_date: '2026-07-23',
      payment_method: 'card',
      reference: 'PAY-1',
    }],
    ...overrides,
  };
}

describe('buildInvoiceAccountingRows', () => {
  it('preserves the original expense-scribe columns before appending fiscal fields', () => {
    expect(INVOICE_CSV_COLUMNS.slice(0, 23).map((column) => column.header)).toEqual([
      'invoice_number',
      'invoice_date',
      'due_date',
      'description',
      'client_name',
      'client_tax_id',
      'client_country',
      'net_amount',
      'vat_amount',
      'irpf_retention',
      'total_amount',
      'currency',
      'payment_status',
      'payment_method',
      'payment_date',
      'payment_notes',
      'vat_zone',
      'vat_due_mode',
      'import_format',
      'psycma_invoice_id',
      'psycma_center_id',
      'psycma_series_id',
      'psycma_status',
    ]);
    expect(INVOICE_CSV_COLUMNS.map((column) => column.header)).toContain('fiscal_invoice_type');
    expect(INVOICE_CSV_COLUMNS.map((column) => column.header)).toContain('replaced_invoice_numbers');
  });

  it('exports an F3 with its frozen recipient and simplified invoice reference', () => {
    const rows = buildInvoiceAccountingRows([
      makeInvoice({
        verifactu_invoice_type: 'F3',
        operation_date: '2026-06-16',
        correction_operation_id: 'operation-1',
        recipient_snapshot: {
          name: 'Cliente fiscal',
          tax_id: '12345678Z',
          address: 'Calle Fiscal 1',
          city: 'Sevilla',
          postal_code: '41001',
          email: 'fiscal@example.com',
        },
      }),
    ], [{
      replacement_invoice_id: 'invoice-new',
      invoice_number: 'SF-2026-082',
      issue_date: '2026-06-16',
    }]);

    expect(rows[0]).toMatchObject({
      fiscal_invoice_type: 'F3',
      correction_kind: 'f3_replacement',
      operation_date: '2026-06-16',
      replaced_invoice_numbers: 'SF-2026-082',
      replaced_invoice_dates: '2026-06-16',
      client_name: 'Cliente fiscal',
      client_tax_id: '12345678Z',
      fiscal_recipient_source: 'invoice_snapshot',
      payment_status: 'paid',
      psycma_correction_operation_id: 'operation-1',
    });
  });

  it('exports an R4 substitution as S and references the rectified invoice', () => {
    const rows = buildInvoiceAccountingRows([
      makeInvoice({
        invoice_number: 'R-2026-010',
        verifactu_invoice_type: 'R4',
        rectified_invoice_id: 'invoice-original',
        rectification_type: 'substitution',
        rectification_reason_code: 'R4',
        rectified_invoice: {
          invoice_number: 'F-2026-009',
          issue_date: '2026-07-20',
        },
      }),
    ], []);

    expect(rows[0]).toMatchObject({
      fiscal_invoice_type: 'R4',
      correction_kind: 'rectificativa_substitution',
      rectification_type: 'S',
      rectification_reason_code: 'R4',
      replaced_invoice_numbers: 'F-2026-009',
      replaced_invoice_dates: '2026-07-20',
    });
  });
});

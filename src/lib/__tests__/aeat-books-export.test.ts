import { describe, expect, it } from 'vitest';
import {
  aeatBooksFileName, buildAeatBooksWorkbook, buildAeatIssuedRows, buildAeatReceivedRows, validateAeatBooks,
  type AeatBooksInput,
} from '@/lib/export/aeatBooksExport';
import type { AccountingExportInvoice } from '@/lib/export/invoiceAccountingExport';

const invoice = (overrides: Partial<AccountingExportInvoice> = {}): AccountingExportInvoice => ({
  id: 'invoice-1', invoice_number: 'F-1', invoice_type: 'complete', issue_date: '2026-02-10', due_date: null,
  operation_date: null, subtotal: 100, tax_rate: 0, tax_amount: 0, retention_amount: 0, total: 100,
  notes: null, status: 'issued', is_valid: true, series_id: null, center_id: 'center-1',
  recipient_snapshot: { name: 'Cliente', tax_id: '12345678Z' }, patients: null, series: null,
  invoice_items: [{ description: 'Sesión', quantity: 1, unit_price: 100, total: 100, tax_rate: 0 }], payments: [],
  ...overrides,
});

const base: AeatBooksInput = {
  center: { id: 'center-1', name: 'Consulta Álvarez', tax_id: '12345678Z', aeat_activity_code: 'A', aeat_activity_type: '05', aeat_iae_epigraph: '776' },
  year: 2026, quarter: 2, invoices: [invoice()], expenses: [],
};

describe('Libros Registro AEAT', () => {
  it('genera una sesión sanitaria exenta E1 con importes en texto decimal español', () => {
    const [row] = buildAeatIssuedRows(base);
    expect(row).toHaveLength(36); expect(row[1]).toBe('1T'); expect(row[18]).toBe('');
    expect(row[19]).toBe('E1'); expect(row[20]).toBe('100,00'); expect(row[22]).toBe('0,00');
  });

  it('no resta la retención al total y solo la anota en una fila con dos tipos de IVA', () => {
    const subject = invoice({ subtotal: 150, tax_rate: 21, tax_amount: 26, retention_amount: 22.5, total: 153.5,
      invoice_items: [
        { description: 'A', quantity: 1, unit_price: 100, total: 100, tax_rate: 21 },
        { description: 'B', quantity: 1, unit_price: 50, total: 50, tax_rate: 10 },
      ] });
    const rows = buildAeatIssuedRows({ ...base, invoices: [subject] });
    expect(rows).toHaveLength(2); expect(rows.map((row) => row[20])).toEqual(['121,00', '55,00']);
    expect(rows.filter((row) => row[31] !== '')).toHaveLength(1);
  });

  it('admite F2 sin NIF y conserva R4/R5', () => {
    const f2 = invoice({ id: 'f2', invoice_number: 'SP-1', invoice_type: 'simplified', recipient_snapshot: null });
    const r4 = invoice({ id: 'r4', invoice_number: 'R-4', rectified_invoice_id: 'old', rectification_reason_code: 'R4', rectified_invoice: { invoice_type: 'complete' } });
    const r5 = invoice({ id: 'r5', invoice_number: 'R-5', rectified_invoice_id: 'old-2', rectified_invoice: { invoice_type: 'simplified' } });
    const rows = buildAeatIssuedRows({ ...base, invoices: [f2, r4, r5] });
    expect(rows.map((row) => row[5])).toEqual(['F2', 'R4', 'R5']);
    expect(rows[0][16]).toBe('VENTAS A CONSUMIDOR FINAL');
  });

  it('mantiene la original y suma la rectificativa por diferencias (neto cero)', () => {
    const original = invoice({ id: 'orig', invoice_number: 'F-10', is_valid: false });
    const credit = invoice({ id: 'rect', invoice_number: 'R-1', issue_date: '2026-03-01', subtotal: -100, total: -100,
      rectified_invoice_id: 'orig', rectification_type: 'I', rectification_reason_code: 'R4',
      rectified_invoice: { invoice_number: 'F-10', issue_date: '2026-02-10', invoice_type: 'complete' },
      invoice_items: [{ description: 'Abono', quantity: 1, unit_price: -100, total: -100, tax_rate: 0 }] });
    const rows = buildAeatIssuedRows({ ...base, invoices: [original, credit] });
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + Number(row[21].replace(',', '.')), 0)).toBe(0);
  });

  it('en sustitución anota la errónea en negativo y la rectificativa completa', () => {
    const original = invoice({ id: 'orig', invoice_number: 'F-10', is_valid: false, retention_amount: 15, retention_rate: 15 });
    const substitute = invoice({ id: 'rect', invoice_number: 'R-2', issue_date: '2026-03-01', subtotal: 80, total: 80,
      rectified_invoice_id: 'orig', rectification_type: 'S', rectification_reason_code: 'R4',
      base_rectificada: 100, cuota_rectificada: 0, retention_amount: 12, retention_rate: 15,
      rectified_invoice: { invoice_number: 'F-10', issue_date: '2026-02-10', invoice_type: 'complete', retention_amount: 15, retention_rate: 15 },
      invoice_items: [{ description: 'Sesión', quantity: 1, unit_price: 80, total: 80, tax_rate: 0 }] });
    const rows = buildAeatIssuedRows({ ...base, invoices: [original, substitute] });
    expect(rows.map((row) => row[21])).toEqual(['100,00', '-100,00', '80,00']);
    expect(rows[1][11]).toBe('10');
    expect(rows.reduce((sum, row) => sum + Number((row[31] || '0').replace(',', '.')), 0)).toBe(12);
  });

  it('una factura completa sin NIF del paciente sale como F2 y su rectificativa como R5', () => {
    const noNif = invoice({ id: 'sf', invoice_number: 'SF260001', recipient_snapshot: null, patients: { first_name: 'Ana', last_name: 'P', tax_id: null } as AccountingExportInvoice['patients'] });
    const rect = invoice({ id: 'rs', invoice_number: 'RS260001', recipient_snapshot: null, patients: null,
      rectified_invoice_id: 'sf', rectification_type: 'differences', rectification_reason_code: 'R5',
      rectified_invoice: { invoice_number: 'SF260001', issue_date: '2026-02-10', invoice_type: null },
      subtotal: -100, total: -100, invoice_items: [{ description: 'Abono', quantity: 1, unit_price: -100, total: -100, tax_rate: 0 }] });
    const input = { ...base, invoices: [noNif, rect] };
    expect(buildAeatIssuedRows(input).map((row) => row[5])).toEqual(['F2', 'R5']);
    expect(buildAeatIssuedRows(input).every((row) => row[16] === 'VENTAS A CONSUMIDOR FINAL')).toBe(true);
    expect(validateAeatBooks(input).errors.filter((issue) => issue.type === 'factura')).toHaveLength(0);
  });

  it('respeta el tipo registrado en VeriFactu', () => {
    const registered = { ...invoice({ id: 'vf' }), verifactu_records: [{ xml_sent: '<sum1:TipoFactura>F2</sum1:TipoFactura>', created_at: '2026-02-10T10:00:00Z' }] };
    expect(buildAeatIssuedRows({ ...base, invoices: [registered] })[0][5]).toBe('F2');
  });

  it('genera gastos SF y limita la cuota parcialmente deducible', () => {
    const expenses = [{ id: 'expense-1', kind: 'variable', status: 'paid', description: 'RETA', amount: 300,
      tax_base: 300, vat_rate: 0, vat_amount: 0, irpf_rate: null, irpf_amount: null, expense_date: '2026-04-02',
      invoice_issue_date: null, operation_date: null, supplier_invoice_number: null, created_at: '2026-04-02T08:00:00Z',
      aeat_invoice_type: 'SF', deductible_vat_amount: null, irpf_deductible_amount: 280,
      category: { id: 'cat-1', name: 'Autónomos', aeat_expense_concept: 'G45' }, supplier: null },
    { id: 'expense-2', kind: 'supplier_invoice', status: 'paid', description: 'Material', amount: 121,
      tax_base: 100, vat_rate: 21, vat_amount: 21, irpf_rate: null, irpf_amount: null, expense_date: '2026-04-03',
      invoice_issue_date: '2026-04-01', operation_date: null, supplier_invoice_number: 'P-1', created_at: '2026-04-03T08:00:00Z',
      aeat_invoice_type: 'F1', deductible_vat_amount: 10.5, irpf_deductible_amount: null,
      category: { id: 'cat-2', name: 'Material', aeat_expense_concept: 'G03' }, supplier: { id: 's-1', name: 'Proveedor', tax_id: 'B12345674', country: 'ES' } }];
    const rows = buildAeatReceivedRows({ ...base, expenses });
    expect(rows[0][5]).toBe('SF'); expect(rows[0][7]).toBe('280,00'); expect(rows[1][29]).toBe('10,50');
  });

  it('bloquea concepto vacío y cuota deducible superior a la soportada', () => {
    const expense = { id: 'expense-1', kind: 'supplier_invoice', status: 'paid', description: 'Gasto', amount: 121,
      tax_base: 100, vat_rate: 21, vat_amount: 21, irpf_rate: null, irpf_amount: null, expense_date: '2026-02-01',
      invoice_issue_date: '2026-02-01', operation_date: null, supplier_invoice_number: '1', created_at: '2026-02-01T00:00:00Z',
      aeat_invoice_type: 'F1', deductible_vat_amount: 22, irpf_deductible_amount: null,
      category: { id: 'cat', name: 'Sin asignar', aeat_expense_concept: null }, supplier: null };
    const result = validateAeatBooks({ ...base, expenses: [expense] });
    expect(result.errors.some((issue) => issue.type === 'categoria')).toBe(true);
    expect(result.errors.some((issue) => issue.message.includes('supera'))).toBe(true);
  });

  it('forma el nombre oficial y limpia caracteres no válidos', () => {
    expect(aeatBooksFileName(2026, '12345678-Z', 'Consulta: Álvarez/Sur')).toBe('202612345678ZTConsulta AlvarezSur.xlsx');
  });

  it('crea las dos hojas con tres filas de cabecera y combinaciones oficiales', async () => {
    const blob = await buildAeatBooksWorkbook(base);
    const ExcelJS = await import('exceljs'); const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['EXPEDIDAS_INGRESOS', 'RECIBIDAS_GASTOS']);
    expect(workbook.getWorksheet('EXPEDIDAS_INGRESOS')?.columnCount).toBe(36);
    expect(workbook.getWorksheet('RECIBIDAS_GASTOS')?.columnCount).toBe(42);
    expect(workbook.getWorksheet('EXPEDIDAS_INGRESOS')?.getCell('I4').value).toBe('10/02/2026');
    expect(workbook.getWorksheet('EXPEDIDAS_INGRESOS')?.getCell('U4').value).toBe('100,00');
    expect(workbook.getWorksheet('EXPEDIDAS_INGRESOS')?.getCell('A1').isMerged).toBe(true);
  }, 30_000);
});

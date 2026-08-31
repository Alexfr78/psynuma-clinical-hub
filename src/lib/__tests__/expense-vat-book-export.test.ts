import { describe, expect, it } from 'vitest';
import {
  buildExpenseVatBookRows,
  createExpenseVatBookExport,
  type ExpenseForVatBookExport,
} from '@/lib/export/expenseVatBookExport';

function makeExpense(overrides: Partial<ExpenseForVatBookExport> = {}): ExpenseForVatBookExport {
  return {
    id: 'expense-1',
    description: 'Alquiler consulta',
    expense_date: '2026-08-01',
    invoice_issue_date: '2026-08-01',
    operation_date: null,
    supplier_invoice_number: 'F-2026-100',
    tax_base: 400,
    vat_rate: 21,
    vat_amount: 84,
    irpf_rate: null,
    irpf_amount: null,
    status: 'pending',
    paid_amount: 0,
    amount: 484,
    category: { name: 'Alquiler' },
    supplier: { name: 'Inmobiliaria Ejemplo SL', tax_id: 'B12345678' },
    ...overrides,
  };
}

describe('buildExpenseVatBookRows', () => {
  it('maps fiscal fields into the expected columns', () => {
    const rows = buildExpenseVatBookRows([makeExpense()]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      issue_date: '2026-08-01',
      supplier_invoice_number: 'F-2026-100',
      supplier_tax_id: 'B12345678',
      supplier_name: 'Inmobiliaria Ejemplo SL',
      tax_base: '400',
      vat_rate: '21',
      vat_amount: '84',
      irpf_rate: '0',
      irpf_amount: '0',
      total_amount: '484',
      payment_status: 'pendiente',
      category_name: 'Alquiler',
      psycma_expense_id: 'expense-1',
    });
  });

  it('falls back to expense_date when invoice_issue_date is missing', () => {
    const rows = buildExpenseVatBookRows([makeExpense({ invoice_issue_date: null })]);
    expect(rows[0].issue_date).toBe('2026-08-01');
  });

  it('subtracts IRPF from the total when present', () => {
    const rows = buildExpenseVatBookRows([
      makeExpense({ tax_base: 1000, vat_amount: 210, irpf_rate: 15, irpf_amount: 150 }),
    ]);
    expect(rows[0].total_amount).toBe('1060'); // 1000 + 210 - 150
  });

  it('maps payment status correctly for paid and cancelled expenses', () => {
    const rows = buildExpenseVatBookRows([
      makeExpense({ id: 'e-paid', status: 'paid' }),
      makeExpense({ id: 'e-cancelled', status: 'cancelled' }),
    ]);
    expect(rows[0].payment_status).toBe('pagado');
    expect(rows[1].payment_status).toBe('cancelado');
  });

  it('handles a missing supplier gracefully', () => {
    const rows = buildExpenseVatBookRows([makeExpense({ supplier: null })]);
    expect(rows[0].supplier_name).toBe('');
    expect(rows[0].supplier_tax_id).toBe('');
  });
});

describe('createExpenseVatBookExport', () => {
  it('produces a UTF-8 BOM-prefixed CSV with a header row', () => {
    const { csv, rows } = createExpenseVatBookExport([makeExpense()]);
    expect(rows).toHaveLength(1);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('fecha_expedicion');
    expect(csv).toContain('Inmobiliaria Ejemplo SL');
  });
});

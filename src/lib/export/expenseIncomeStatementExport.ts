import { buildCsv } from './buildCsv';

/**
 * Quarterly income-statement-style export ("Cuenta de resultados") combining
 * issued invoices and recorded expenses. A single summary row per export,
 * following the same CSV+BOM pattern as the rest of `src/lib/export`.
 */

export interface IncomeStatementInputs {
  periodLabel: string; // e.g. 'T3 2026'
  income: number; // sum of invoices.total, status in (issued, paid), is_valid = true
  expensesFixedRecurring: number;
  expensesVariable: number;
  expensesSupplierInvoice: number;
  expensesProfessionalPayment: number;
  vatOutput: number; // IVA repercutido (ventas)
  vatInput: number; // IVA soportado (compras, kind = supplier_invoice)
  irpfWithheldOnSales: number; // invoices.retention_amount
  irpfWithheldOnExpenses: number; // expenses.irpf_amount
}

export interface IncomeStatementRow {
  period: string;
  income: string;
  expenses_total: string;
  expenses_fixed_recurring: string;
  expenses_variable: string;
  expenses_supplier_invoice: string;
  expenses_professional_payment: string;
  net_result: string;
  vat_output: string;
  vat_input: string;
  vat_balance: string;
  irpf_withheld_sales: string;
  irpf_withheld_expenses: string;
}

export const INCOME_STATEMENT_CSV_COLUMNS: Array<{ key: keyof IncomeStatementRow; header: string }> = [
  { key: 'period', header: 'periodo' },
  { key: 'income', header: 'ingresos' },
  { key: 'expenses_total', header: 'gastos_total' },
  { key: 'expenses_fixed_recurring', header: 'gastos_fijos_recurrentes' },
  { key: 'expenses_variable', header: 'gastos_variables' },
  { key: 'expenses_supplier_invoice', header: 'gastos_facturas_proveedor' },
  { key: 'expenses_professional_payment', header: 'gastos_pagos_profesionales' },
  { key: 'net_result', header: 'resultado_neto' },
  { key: 'vat_output', header: 'iva_repercutido' },
  { key: 'vat_input', header: 'iva_soportado' },
  { key: 'vat_balance', header: 'iva_a_ingresar_o_compensar' },
  { key: 'irpf_withheld_sales', header: 'irpf_retenido_ventas' },
  { key: 'irpf_withheld_expenses', header: 'irpf_retenido_gastos' },
];

function formatDecimal(value: number): string {
  return String(Number((Number(value) || 0).toFixed(2)));
}

export function buildIncomeStatementRow(inputs: IncomeStatementInputs): IncomeStatementRow {
  const expensesTotal =
    inputs.expensesFixedRecurring +
    inputs.expensesVariable +
    inputs.expensesSupplierInvoice +
    inputs.expensesProfessionalPayment;

  return {
    period: inputs.periodLabel,
    income: formatDecimal(inputs.income),
    expenses_total: formatDecimal(expensesTotal),
    expenses_fixed_recurring: formatDecimal(inputs.expensesFixedRecurring),
    expenses_variable: formatDecimal(inputs.expensesVariable),
    expenses_supplier_invoice: formatDecimal(inputs.expensesSupplierInvoice),
    expenses_professional_payment: formatDecimal(inputs.expensesProfessionalPayment),
    net_result: formatDecimal(inputs.income - expensesTotal),
    vat_output: formatDecimal(inputs.vatOutput),
    vat_input: formatDecimal(inputs.vatInput),
    vat_balance: formatDecimal(inputs.vatOutput - inputs.vatInput),
    irpf_withheld_sales: formatDecimal(inputs.irpfWithheldOnSales),
    irpf_withheld_expenses: formatDecimal(inputs.irpfWithheldOnExpenses),
  };
}

export function createIncomeStatementExport(inputs: IncomeStatementInputs): { row: IncomeStatementRow; csv: string } {
  const row = buildIncomeStatementRow(inputs);
  return { row, csv: buildCsv([row], INCOME_STATEMENT_CSV_COLUMNS, { quoteAllText: true }) };
}

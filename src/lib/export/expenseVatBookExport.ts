import { buildCsv } from './buildCsv';

/**
 * "Libro de Registro de Facturas Recibidas" (supported-VAT book) export.
 * Mirrors the pattern of `invoiceAccountingExport.ts`: a row interface, a
 * fixed column list, a pure `build*Rows` transform, and a `create*Export`
 * convenience wrapper around `buildCsv`.
 *
 * Only `kind = 'supplier_invoice'` expenses belong in this book — variable
 * expenses without a supplier invoice and professional_payment settlements
 * carry no supported VAT by definition.
 */

export interface ExpenseForVatBookExport {
  id: string;
  description: string;
  expense_date: string;
  invoice_issue_date: string | null;
  operation_date: string | null;
  supplier_invoice_number: string | null;
  tax_base: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  status: 'pending' | 'paid' | 'cancelled';
  paid_amount: number;
  amount: number;
  category?: { name: string } | null;
  supplier?: { name: string; tax_id: string | null } | null;
}

export interface ExpenseVatBookRow {
  issue_date: string;
  operation_date: string;
  supplier_invoice_number: string;
  supplier_tax_id: string;
  supplier_name: string;
  description: string;
  tax_base: string;
  vat_rate: string;
  vat_amount: string;
  surcharge_rate: string;
  surcharge_amount: string;
  irpf_rate: string;
  irpf_amount: string;
  total_amount: string;
  payment_status: string;
  category_name: string;
  psycma_expense_id: string;
}

export const EXPENSE_VAT_BOOK_CSV_COLUMNS: Array<{ key: keyof ExpenseVatBookRow; header: string }> = [
  { key: 'issue_date', header: 'fecha_expedicion' },
  { key: 'operation_date', header: 'fecha_operacion' },
  { key: 'supplier_invoice_number', header: 'numero_factura_proveedor' },
  { key: 'supplier_tax_id', header: 'nif_proveedor' },
  { key: 'supplier_name', header: 'nombre_proveedor' },
  { key: 'description', header: 'concepto' },
  { key: 'tax_base', header: 'base_imponible' },
  { key: 'vat_rate', header: 'tipo_iva' },
  { key: 'vat_amount', header: 'cuota_iva' },
  { key: 'surcharge_rate', header: 'tipo_recargo_equivalencia' },
  { key: 'surcharge_amount', header: 'cuota_recargo_equivalencia' },
  { key: 'irpf_rate', header: 'tipo_retencion_irpf' },
  { key: 'irpf_amount', header: 'cuota_retencion_irpf' },
  { key: 'total_amount', header: 'total_factura' },
  { key: 'payment_status', header: 'estado_pago' },
  { key: 'category_name', header: 'categoria_gasto' },
  { key: 'psycma_expense_id', header: 'referencia_interna_psycma' },
];

function formatDecimal(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return String(Number(n.toFixed(2)));
}

export function buildExpenseVatBookRows(expenses: ExpenseForVatBookExport[]): ExpenseVatBookRow[] {
  return expenses.map((expense) => {
    const taxBase = Number(expense.tax_base) || 0;
    const vatAmount = Number(expense.vat_amount) || 0;
    const irpfAmount = Number(expense.irpf_amount) || 0;

    return {
      issue_date: expense.invoice_issue_date || expense.expense_date,
      operation_date: expense.operation_date || '',
      supplier_invoice_number: expense.supplier_invoice_number || '',
      supplier_tax_id: expense.supplier?.tax_id || '',
      supplier_name: expense.supplier?.name || '',
      description: expense.description,
      tax_base: formatDecimal(taxBase),
      vat_rate: formatDecimal(expense.vat_rate),
      vat_amount: formatDecimal(vatAmount),
      surcharge_rate: '0',
      surcharge_amount: '0',
      irpf_rate: formatDecimal(expense.irpf_rate),
      irpf_amount: formatDecimal(irpfAmount),
      total_amount: formatDecimal(taxBase + vatAmount - irpfAmount),
      payment_status: expense.status === 'paid' ? 'pagado' : expense.status === 'cancelled' ? 'cancelado' : 'pendiente',
      category_name: expense.category?.name || '',
      psycma_expense_id: expense.id,
    };
  });
}

export interface ExpenseVatBookExportResult {
  rows: ExpenseVatBookRow[];
  csv: string;
}

export function createExpenseVatBookExport(expenses: ExpenseForVatBookExport[]): ExpenseVatBookExportResult {
  const rows = buildExpenseVatBookRows(expenses);
  return {
    rows,
    csv: buildCsv(rows, EXPENSE_VAT_BOOK_CSV_COLUMNS, { quoteAllText: true }),
  };
}

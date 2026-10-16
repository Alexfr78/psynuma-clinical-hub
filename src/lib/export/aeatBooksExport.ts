import { validateSpanishTaxId } from '@/lib/nif-validation';
import {
  AEAT_ACTIVITY_CODES, AEAT_ACTIVITY_TYPES_A, AEAT_ACTIVITY_TYPES_B, AEAT_EXPENSE_CONCEPTS, AEAT_ISSUED_INVOICE_TYPES,
  AEAT_RECEIVED_INVOICE_TYPES, AEAT_VAT_RATES, aeatCodeSet,
} from '@/lib/aeat-codes';
import {
  extractXmlValue, getRecipientSnapshot, inferInvoiceType, resolveOperationDate,
  type AccountingExportInvoice,
} from './invoiceAccountingExport';

export type AeatCell = string;
export type AeatRow = AeatCell[];
export type AeatReferenceType = 'centro' | 'factura' | 'gasto' | 'categoria';
export interface AeatIssue { message: string; type: AeatReferenceType; id?: string; href?: string }

export interface AeatCenter {
  id: string; name: string; tax_id: string | null;
  aeat_activity_code: string; aeat_activity_type: string; aeat_iae_epigraph: string | null;
}
export interface AeatExpense {
  id: string; kind: string; status: string; description: string; amount: number;
  tax_base: number | null; vat_rate: number | null; vat_amount: number | null;
  irpf_rate: number | null; irpf_amount: number | null; expense_date: string;
  invoice_issue_date: string | null; operation_date: string | null; supplier_invoice_number: string | null;
  created_at: string; aeat_invoice_type: string; deductible_vat_amount: number | null;
  irpf_deductible_amount: number | null;
  category: { id: string; name: string; aeat_expense_concept: string | null } | null;
  supplier: { id: string; name: string; tax_id: string | null; country?: string | null } | null;
}
export interface AeatBooksInput {
  center: AeatCenter; invoices: AccountingExportInvoice[]; expenses: AeatExpense[];
  year: number; quarter: 1 | 2 | 3 | 4;
  /** Canjes de simplificada por completa (F3): qué factura sustituye a cuál. */
  substitutions?: AeatSubstitution[];
}
export interface AeatSubstitution {
  replacement_invoice_id: string; substituted_invoice_id: string;
  substituted_invoice: { invoice_number: string; issue_date: string } | null;
}

const MAX_BYTES = 4 * 1024 * 1024;
const decimal = (value: number | string | null | undefined) => Number(value ?? 0).toFixed(2).replace('.', ',');
const date = (value: string | null | undefined) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '';
const normalizedTaxId = (value: string | null | undefined) => (value ?? '').replace(/[\s.\-/]/g, '').toUpperCase();
const quarterOf = (value: string) => `${Math.floor((Number(value.slice(5, 7)) - 1) / 3) + 1}T`;
const rangeEnd = (year: number, quarter: number) => new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
const inRange = (value: string, year: number, quarter: number) => value >= `${year}-01-01` && value <= rangeEnd(year, quarter);
const splitNumber = (invoiceNumber: string) => {
  const match = invoiceNumber.match(/^(.*?)[\s\-/]*([0-9]+)$/);
  return match ? { series: match[1].slice(0, 20), number: match[2].slice(0, 20) } : { series: '', number: invoiceNumber.slice(0, 20) };
};

function fiscalXml(invoice: AccountingExportInvoice): string {
  const extended = invoice as AccountingExportInvoice & { verifactu_records?: Array<{ xml_sent?: string | null; created_at?: string | null }> };
  const sorted = [...(extended.verifactu_records ?? [])]
    .filter((record) => record.xml_sent)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const latest = sorted[sorted.length - 1];
  return String(latest?.xml_sent ?? '');
}
function recipient(invoice: AccountingExportInvoice, type: string) {
  const snapshot = getRecipientSnapshot(invoice.recipient_snapshot);
  const taxId = normalizedTaxId(snapshot?.tax_id || invoice.patients?.tax_id);
  const name = snapshot?.name || [invoice.patients?.first_name, invoice.patients?.last_name].filter(Boolean).join(' ');
  if (type === 'F2' || ((type === 'R5' || type === 'F3') && !hasRecipientId(invoice))) return { nifType: '', country: '', id: '', name: 'VENTAS A CONSUMIDOR FINAL' };
  const validSpanish = taxId !== '' && validateSpanishTaxId(taxId).valid;
  return { nifType: validSpanish ? '' : taxId ? (snapshot?.id_type || '06') : '', country: validSpanish ? '' : (snapshot?.country || '').slice(0, 2).toUpperCase(), id: taxId, name: name || '' };
}

/** El destinatario está identificado: NIF español válido o identificación extranjera completa (tipo y país). */
function hasRecipientId(invoice: Pick<AccountingExportInvoice, 'recipient_snapshot' | 'patients'>): boolean {
  const snapshot = getRecipientSnapshot(invoice.recipient_snapshot);
  // Con snapshot manda lo que se emitió; la ficha actual del paciente solo vale para facturas antiguas sin snapshot.
  const taxId = normalizedTaxId(snapshot ? snapshot.tax_id : invoice.patients?.tax_id);
  if (!taxId) return false;
  if (validateSpanishTaxId(taxId).valid) return true;
  return Boolean(snapshot?.id_type?.match(/^0[2-6]$/) && (snapshot.id_type === '02' || snapshot.country?.length === 2));
}

/**
 * Tipo de factura del libro. Manda el que ya se registró en VeriFactu; si no hay registro,
 * una factura sin destinatario identificado es F2 y su rectificativa R5 (diseño, validación 2).
 */
function aeatInvoiceType(invoice: AccountingExportInvoice): string {
  const registered = extractXmlValue(fiscalXml(invoice), 'TipoFactura');
  if (registered && aeatCodeSet(AEAT_ISSUED_INVOICE_TYPES).has(registered)) return registered;
  const identified = hasRecipientId(invoice);
  if (invoice.rectified_invoice_id) {
    const original = invoice.rectified_invoice;
    const originalIdentified = original ? hasRecipientId({ recipient_snapshot: original.recipient_snapshot, patients: invoice.patients }) : identified;
    if (!identified && !originalIdentified) return 'R5';
    const code = invoice.rectification_reason_code ?? '';
    return /^R[1-4]$/.test(code) ? code : inferInvoiceType(invoice, getRecipientSnapshot(invoice.recipient_snapshot)) || 'R4';
  }
  const inferred = inferInvoiceType(invoice, getRecipientSnapshot(invoice.recipient_snapshot));
  return inferred === 'F1' && !identified ? 'F2' : inferred;
}

/** Facturas que entran en el libro: emitidas y no anuladas. Las rectificadas se quedan (diseño, validación 8). */
const isBookInvoice = (invoice: AccountingExportInvoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled';
const isSubstitution = (invoice: AccountingExportInvoice) => invoice.rectification_type === 'S' || invoice.rectification_type === 'substitution';

interface IssuedLine { rate: number; base: number; vat: number; retentionRate?: number | string | null; retentionAmount?: number | string | null }
interface IssuedEntry {
  invoice: AccountingExportInvoice; type: string; issueDate: string; operationDate: string;
  invoiceNumber: string; lines: IssuedLine[];
}

function issuedEntries(invoice: AccountingExportInvoice, input: AeatBooksInput): IssuedEntry[] {
  const type = aeatInvoiceType(invoice);
  const operationDate = resolveOperationDate(invoice) || invoice.issue_date;
  const groups = new Map<number, { base: number; vat: number }>();
  invoice.invoice_items.forEach((item) => {
    const rate = Number(item.tax_rate ?? invoice.tax_rate ?? 0);
    const total = Number(item.total ?? Number(item.quantity) * Number(item.unit_price));
    const current = groups.get(rate) ?? { base: 0, vat: 0 };
    current.base += total;
    current.vat += item.tax_amount !== null && item.tax_amount !== undefined ? Number(item.tax_amount) : total * rate / 100;
    groups.set(rate, current);
  });
  if (!groups.size) groups.set(Number(invoice.tax_rate ?? 0), { base: Number(invoice.subtotal ?? 0), vat: Number(invoice.tax_amount ?? 0) });
  const lines: IssuedLine[] = [...groups.entries()].map(([rate, totals], index) => ({
    rate, ...totals,
    ...(index === 0 ? { retentionRate: invoice.retention_rate, retentionAmount: invoice.retention_amount } : {}),
  }));
  const entries: IssuedEntry[] = [];
  // Sustitución: la factura errónea va con importes negativos y después la rectificativa completa (diseño, validación 8).
  const original = invoice.rectified_invoice;
  if (isSubstitution(invoice) && original && invoice.base_rectificada !== null && invoice.base_rectificada !== undefined) {
    const base = Number(invoice.base_rectificada);
    const vat = Number(invoice.cuota_rectificada ?? 0);
    entries.push({
      invoice, type, issueDate: original.issue_date || invoice.issue_date, operationDate: invoice.issue_date,
      invoiceNumber: original.invoice_number || invoice.invoice_number,
      lines: [{
        rate: base !== 0 ? Math.round((vat / base) * 10000) / 100 : 0, base: -base, vat: -vat,
        retentionRate: original.retention_rate,
        retentionAmount: original.retention_amount ? -Math.abs(Number(original.retention_amount)) : null,
      }],
    });
  }
  // Canje de simplificada por completa: asiento negativo de la simplificada + asiento de la completa (F1).
  // Es la primera opción de la FAQ de la AEAT; con un solo asiento F3 el ingreso del IRPF se contaría dos veces.
  if (type === 'F3') {
    const substitution = input.substitutions?.find((item) => item.replacement_invoice_id === invoice.id);
    if (substitution) {
      const substituted = input.invoices.find((item) => item.id === substitution.substituted_invoice_id);
      entries.push({
        invoice, type: substituted ? aeatInvoiceType(substituted) : 'F2',
        issueDate: substitution.substituted_invoice?.issue_date || substituted?.issue_date || invoice.issue_date,
        operationDate, invoiceNumber: substitution.substituted_invoice?.invoice_number || substituted?.invoice_number || invoice.invoice_number,
        lines: lines.map((line) => ({ ...line, base: -line.base, vat: -line.vat, retentionAmount: line.retentionAmount ? -Number(line.retentionAmount) : line.retentionAmount })),
      });
      entries.push({ invoice, type: 'F1', issueDate: invoice.issue_date, operationDate, invoiceNumber: invoice.invoice_number, lines });
      return entries;
    }
  }
  entries.push({ invoice, type, issueDate: invoice.issue_date, operationDate, invoiceNumber: invoice.invoice_number, lines });
  return entries;
}

export function buildAeatIssuedRows(input: AeatBooksInput): AeatRow[] {
  return input.invoices
    .filter((invoice) => isBookInvoice(invoice) && inRange(invoice.issue_date, input.year, input.quarter))
    .flatMap((invoice) => issuedEntries(invoice, input))
    .flatMap(({ invoice, type, issueDate, operationDate, invoiceNumber, lines }) => {
      const id = splitNumber(invoiceNumber);
      const party = recipient(invoice, type);
      const xml = fiscalXml(invoice);
      const xmlQualification = extractXmlValue(xml, 'CalificacionOperacion');
      const xmlExemption = extractXmlValue(xml, 'OperacionExenta');
      return lines.map((line) => {
        // Calificación y causa de exención se excluyen (validaciones 19 y 20): una exenta solo lleva E1.
        const exemption = xmlExemption || (!xmlQualification && line.rate === 0 ? 'E1' : '');
        const qualification = exemption ? '' : (xmlQualification || 'S1');
        const row = Array<string>(36).fill('');
        row[0] = String(Number(operationDate.slice(0, 4))); row[1] = quarterOf(operationDate);
        row[2] = input.center.aeat_activity_code; row[3] = ['C', 'D'].includes(row[2]) ? '' : input.center.aeat_activity_type;
        row[4] = input.center.aeat_iae_epigraph ?? ''; row[5] = type; row[6] = 'I01'; row[7] = decimal(line.base);
        row[8] = date(issueDate); row[9] = operationDate === issueDate ? '' : date(operationDate);
        row[10] = id.series; row[11] = id.number; row[13] = party.nifType; row[14] = party.country;
        row[15] = party.id; row[16] = party.name.slice(0, 40); row[17] = '01'; row[18] = qualification; row[19] = exemption;
        row[20] = decimal(line.base + line.vat); row[21] = decimal(line.base); row[22] = decimal(line.rate); row[23] = decimal(line.vat);
        if (Number(line.retentionAmount ?? 0) !== 0) {
          row[30] = decimal(line.retentionRate ?? Math.abs(Number(line.retentionAmount)) / Math.max(Math.abs(line.base), 0.01) * 100);
          row[31] = decimal(line.retentionAmount);
        }
        row[35] = invoice.id;
        return row;
      });
    });
}

export function buildAeatReceivedRows(input: AeatBooksInput): AeatRow[] {
  return input.expenses
    .filter((expense) => expense.status !== 'cancelled' && inRange(expense.expense_date, input.year, input.quarter))
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((expense, index) => {
      const row = Array<string>(42).fill('');
      const issueDate = expense.invoice_issue_date || expense.expense_date;
      const taxId = normalizedTaxId(expense.supplier?.tax_id);
      const spanish = taxId !== '' && validateSpanishTaxId(taxId).valid;
      const base = Number(expense.tax_base ?? expense.amount);
      const vat = Number(expense.vat_amount ?? 0);
      row[0] = String(input.year); row[1] = quarterOf(expense.expense_date); row[2] = input.center.aeat_activity_code;
      row[3] = ['C', 'D'].includes(row[2]) ? '' : input.center.aeat_activity_type; row[4] = input.center.aeat_iae_epigraph ?? '';
      row[5] = expense.aeat_invoice_type || 'F1'; row[6] = expense.category?.aeat_expense_concept ?? '';
      row[7] = decimal(expense.irpf_deductible_amount ?? expense.tax_base ?? expense.amount); row[8] = date(issueDate);
      row[9] = expense.operation_date && expense.operation_date !== issueDate ? date(expense.operation_date) : '';
      row[10] = (expense.supplier_invoice_number || expense.id).slice(0, 40); row[12] = date(expense.expense_date);
      row[13] = String(index + 1); row[15] = spanish ? '' : taxId ? '06' : ''; row[16] = spanish ? '' : (expense.supplier?.country ?? '').slice(0, 2).toUpperCase();
      row[17] = taxId; row[18] = (expense.supplier?.name || 'PROVEEDOR NO IDENTIFICADO').slice(0, 40); row[19] = '01';
      row[20] = 'N'; row[21] = 'N'; row[22] = ''; row[25] = decimal(base + vat); row[26] = decimal(base);
      row[27] = decimal(expense.vat_rate ?? 0); row[28] = decimal(vat); row[29] = decimal(expense.deductible_vat_amount ?? vat);
      if (Number(expense.irpf_amount ?? 0) !== 0) { row[36] = decimal(expense.irpf_rate ?? 0); row[37] = decimal(expense.irpf_amount); }
      row[41] = expense.id;
      return row;
    });
}

export function validateAeatBooks(input: AeatBooksInput): { errors: AeatIssue[]; warnings: AeatIssue[] } {
  const errors: AeatIssue[] = []; const warnings: AeatIssue[] = [];
  const centerNif = normalizedTaxId(input.center.tax_id);
  if (!centerNif || !validateSpanishTaxId(centerNif).valid) errors.push({ type: 'centro', id: input.center.id, href: '/configuracion?section=facturacion-info', message: 'El NIF del centro está ausente o no es válido.' });
  if (!aeatCodeSet(AEAT_ACTIVITY_CODES).has(input.center.aeat_activity_code)) errors.push({ type: 'centro', id: input.center.id, href: '/configuracion?section=facturacion-info', message: 'El código de actividad AEAT no es válido.' });
  const activityTypes = input.center.aeat_activity_code === 'A' ? AEAT_ACTIVITY_TYPES_A : AEAT_ACTIVITY_TYPES_B;
  if (!['C', 'D'].includes(input.center.aeat_activity_code) && !aeatCodeSet(activityTypes).has(input.center.aeat_activity_type)) errors.push({ type: 'centro', id: input.center.id, href: '/configuracion?section=facturacion-info', message: 'El tipo de actividad AEAT no es válido para el código de actividad seleccionado.' });
  if (input.center.aeat_activity_code === 'A' && !input.center.aeat_iae_epigraph?.trim()) errors.push({ type: 'centro', id: input.center.id, href: '/configuracion?section=facturacion-info', message: 'Falta el epígrafe IAE para una actividad incluida en el IAE.' });
  input.invoices.filter(isBookInvoice).forEach((invoice) => {
    const type = aeatInvoiceType(invoice);
    if (!aeatCodeSet(AEAT_ISSUED_INVOICE_TYPES).has(type)) errors.push({ type: 'factura', id: invoice.id, href: `/facturas?invoice=${invoice.id}`, message: `La factura ${invoice.invoice_number} no tiene un tipo AEAT válido.` });
    const issue = invoice.issue_date.slice(0, 10);
    if (!inRange(issue, input.year, input.quarter)) return;
    const taxId = normalizedTaxId(getRecipientSnapshot(invoice.recipient_snapshot)?.tax_id || invoice.patients?.tax_id);
    const snapshot = getRecipientSnapshot(invoice.recipient_snapshot);
    const spanish = taxId !== '' && validateSpanishTaxId(taxId).valid;
    const foreignComplete = !spanish && Boolean(taxId && snapshot?.id_type?.match(/^0[2-6]$/) && (snapshot.id_type === '02' || snapshot.country?.length === 2));
    if ((type === 'F1' || type === 'F3') && !spanish && !foreignComplete) errors.push({ type: 'factura', id: invoice.id, href: `/facturas?invoice=${invoice.id}`, message: `La factura ${invoice.invoice_number} es F1 y no tiene identificación española válida ni identificación extranjera completa (tipo y país).` });
    const exchanged = input.substitutions?.some((item) => item.substituted_invoice_id === invoice.id);
    if (type === 'F2' && !exchanged && !extractXmlValue(fiscalXml(invoice), 'TipoFactura') && Math.abs(Number(invoice.total)) > 400) {
      warnings.push({ type: 'factura', id: invoice.id, href: `/facturas?invoice=${invoice.id}`, message: `La factura ${invoice.invoice_number} no identifica al paciente (sale como F2) y supera 400 €. Revísalo con tu gestor.` });
    }
    const operationYear = (resolveOperationDate(invoice) || issue).slice(0, 4);
    if (operationYear !== String(input.year)) warnings.push({ type: 'factura', id: invoice.id, href: `/facturas?invoice=${invoice.id}`, message: `La factura ${invoice.invoice_number} tiene fecha de operación de ${operationYear}: saldrá con ese ejercicio. Revísalo con tu gestor.` });
    if (invoice.invoice_number.length > 40) errors.push({ type: 'factura', id: invoice.id, message: `La identificación de la factura ${invoice.invoice_number} supera 40 caracteres.` });
  });
  input.expenses.filter((expense) => expense.status !== 'cancelled' && inRange(expense.expense_date, input.year, input.quarter)).forEach((expense) => {
    if (!expense.category?.aeat_expense_concept) errors.push({ type: 'categoria', id: expense.category?.id, href: '/configuracion?section=gastos-categorias', message: `Asigna un concepto AEAT a la categoría del gasto "${expense.description}".` });
    else if (!aeatCodeSet(AEAT_EXPENSE_CONCEPTS).has(expense.category.aeat_expense_concept)) errors.push({ type: 'categoria', id: expense.category.id, message: `El concepto AEAT de la categoría ${expense.category.name} no es válido.` });
    if (!aeatCodeSet(AEAT_RECEIVED_INVOICE_TYPES).has(expense.aeat_invoice_type || 'F1')) errors.push({ type: 'gasto', id: expense.id, message: `El gasto "${expense.description}" no tiene un tipo de factura AEAT válido.` });
    if (Number(expense.deductible_vat_amount ?? expense.vat_amount ?? 0) > Number(expense.vat_amount ?? 0) + 0.005) errors.push({ type: 'gasto', id: expense.id, href: `/gastos?expense=${expense.id}`, message: `El IVA deducible de "${expense.description}" supera la cuota soportada.` });
    if (!expense.supplier?.tax_id && expense.aeat_invoice_type !== 'SF') warnings.push({ type: 'gasto', id: expense.id, message: `El gasto "${expense.description}" no identifica al proveedor.` });
    if (expense.supplier?.tax_id && !validateSpanishTaxId(expense.supplier.tax_id).valid && !expense.supplier.country?.trim()) errors.push({ type: 'gasto', id: expense.id, message: `El proveedor de "${expense.description}" tiene identificación extranjera pero no país.` });
  });
  const issuedMax = [4,2,1,2,4,2,3,99,10,10,20,20,20,2,2,20,40,2,2,2,99,99,99,99,99,99,10,99,2,34,99,99,15,1,20,40];
  const receivedMax = [4,2,1,2,4,2,3,99,10,10,40,20,10,20,20,2,2,20,40,2,1,1,1,4,2,99,99,99,99,99,99,99,10,99,2,34,99,99,15,1,20,40];
  const validateLengths = (rows: AeatRow[], limits: number[], type: 'factura' | 'gasto', referenceIndex: number) => rows.forEach((row) => row.forEach((value, column) => {
    if (value.length > limits[column]) errors.push({ type, id: row[referenceIndex], message: `El campo de la columna ${column + 1} de ${type === 'factura' ? 'la factura' : 'el gasto'} ${row[referenceIndex]} supera la longitud máxima de ${limits[column]} caracteres.` });
  }));
  const issuedRows = buildAeatIssuedRows(input); const receivedRows = buildAeatReceivedRows(input);
  validateLengths(issuedRows, issuedMax, 'factura', 35); validateLengths(receivedRows, receivedMax, 'gasto', 41);
  issuedRows.forEach((row) => { if (!AEAT_VAT_RATES.includes(Number(row[22].replace(',', '.')) as typeof AEAT_VAT_RATES[number])) errors.push({ type: 'factura', id: row[35], message: `La factura ${row[35]} usa un tipo de IVA fuera de la lista oficial.` }); });
  return { errors, warnings };
}

const ISSUED_HEADERS = [
  ['Autoliquidación','', 'Actividad','','','Tipo de Factura','Concepto de Ingreso','Ingreso Computable','Fecha Expedición','Fecha Operación','Identificación de la Factura','','','NIF Destinatario','','','Nombre Destinatario','Clave de Operación','Calificación de la Operación','Operación Exenta','Total Factura','Base Imponible','Tipo de IVA','Cuota IVA Repercutida','Tipo de Recargo Eq.','Cuota Recargo Eq.','Cobro','','','','Tipo Retención del IRPF','Importe Retenido del IRPF','Registro Acuerdo Facturación','Inmueble','','Referencia Externa'],
  ['Ejercicio','Periodo','Código','Tipo','Grupo o Epígrafe del IAE','','','','','','Serie','Número','Número-Final','Tipo','Código País','Identificación','','','','','','','','','','','Fecha','Importe','Medio Utilizado','Identificación Medio Utilizado','','','','Situación','Referencia Catastral',''],
  ['Decimal (4,0)','Alfanumérico (2)','Alfanumérico (1)','Alfanumérico (2)','Alfanumérico (4)','Alfanumérico (2)','Alfanumérico (3)','Decimal(12,2)','Fecha(dd/mm/yyyy)','Fecha(dd/mm/yyyy)','Alfanumérico (20)','Alfanumérico (20)','Alfanumérico (20)','Alfanumérico (2)','Alfanumérico (2)','Alfanumérico (20)','Alfanumérico (40)','Alfanumérico (2)','Alfanumérico (2)','Alfanumérico (2)','Decimal(12,2)','Decimal(12,2)','Decimal(4,2)','Decimal(12,2)','Decimal(4,2)','Decimal(12,2)','Fecha(dd/mm/yyyy)','Decimal(12,2)','Alfanumérico (2)','Alfanumérico (34)','Decimal(4,2)','Decimal(12,2)','Alfanumérico (15)','Alfanumérico (1)','Alfanumérico (20)','Alfanumérico (40)'],
];
const RECEIVED_HEADERS = [
  ['Autoliquidación','','Actividad','','','Tipo de Factura','Concepto de Gasto','Gasto Deducible','Fecha Expedición','Fecha Operación','Identificación Factura del Expedidor','','Fecha Recepción','Número Recepción','Número Recepción Final','NIF Expedidor','','','Nombre Expedidor','Clave de Operación','Bien de Inversión','Inversión del Sujeto Pasivo','Deducible en Periodo Posterior','Periodo Deducción','','Total Factura','Base Imponible','Tipo de IVA','Cuota IVA Soportado','Cuota Deducible','Tipo de Recargo Eq.','Cuota Recargo Eq.','Pago','','','','Tipo Retención del IRPF','Importe Retenido del IRPF','Registro Acuerdo Facturación','Inmueble','','Referencia Externa'],
  ['Ejercicio','Periodo','Código','Tipo','Grupo o Epígrafe del IAE','','','','','','(Serie-Número)','Número-Final','','','','Tipo','Código País','Identificación','','','','','','Ejercicio','Periodo','','','','','','','','Fecha','Importe','Medio Utilizado','Identificación Medio Utilizado','','','','Situación','Referencia Catastral',''],
  ['Decimal (4,0)','Alfanumérico (2)','Alfanumérico (1)','Alfanumérico (2)','Alfanumérico (4)','Alfanumérico (2)','Alfanumérico (3)','Decimal(12,2)','Fecha(dd/mm/yyyy)','Fecha(dd/mm/yyyy)','Alfanumérico (40)','Alfanumérico (20)','Fecha(dd/mm/yyyy)','Alfanumérico (20)','Alfanumérico (20)','Alfanumérico (2)','Alfanumérico (2)','Alfanumérico (20)','Alfanumérico (40)','Alfanumérico (2)','Alfanumérico (1)','Alfanumérico (1)','Alfanumérico (1)','Decimal (4,0)','Alfanumérico (2)','Decimal(12,2)','Decimal(12,2)','Decimal(4,2)','Decimal(12,2)','Decimal(12,2)','Decimal(4,2)','Decimal(12,2)','Fecha(dd/mm/yyyy)','Decimal(12,2)','Alfanumérico (2)','Alfanumérico (34)','Decimal(4,2)','Decimal(12,2)','Alfanumérico (15)','Alfanumérico (1)','Alfanumérico (20)','Alfanumérico (40)'],
];
const ISSUED_MERGES = ['A1:B1','C1:E1','F1:F2','G1:G2','H1:H2','I1:I2','J1:J2','K1:M1','N1:P1','Q1:Q2','R1:R2','S1:S2','T1:T2','U1:U2','V1:V2','W1:W2','X1:X2','Y1:Y2','Z1:Z2','AA1:AD1','AE1:AE2','AF1:AF2','AG1:AG2','AH1:AI1','AJ1:AJ2'];
const RECEIVED_MERGES = ['A1:B1','C1:E1','F1:F2','G1:G2','H1:H2','I1:I2','J1:J2','K1:L1','M1:M2','N1:N2','O1:O2','P1:R1','S1:S2','T1:T2','U1:U2','V1:V2','W1:W2','X1:Y1','Z1:Z2','AA1:AA2','AB1:AB2','AC1:AC2','AD1:AD2','AE1:AE2','AF1:AF2','AG1:AJ1','AK1:AK2','AL1:AL2','AM1:AM2','AN1:AO1','AP1:AP2'];

export async function buildAeatBooksWorkbook(input: AeatBooksInput): Promise<Blob> {
  const { errors } = validateAeatBooks(input);
  if (errors.length) throw new Error(`No se puede exportar: hay ${errors.length} errores de validación.`);
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const addSheet = (name: string, headers: string[][], rows: AeatRow[], merges: string[]) => {
    const sheet = workbook.addWorksheet(name);
    headers.forEach((header) => sheet.addRow(header)); rows.forEach((row) => sheet.addRow(row));
    merges.forEach((merge) => sheet.mergeCells(merge));
    sheet.getRows(1, 3)?.forEach((row) => { row.font = { name: 'Arial', size: 9, bold: true }; row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
    sheet.eachRow((row, rowNumber) => { if (rowNumber > 3) row.eachCell({ includeEmpty: true }, (cell) => { cell.numFmt = '@'; cell.font = { name: 'Arial', size: 9 }; }); });
    sheet.views = [{ state: 'frozen', ySplit: 3 }];
  };
  addSheet('EXPEDIDAS_INGRESOS', ISSUED_HEADERS, buildAeatIssuedRows(input), ISSUED_MERGES);
  addSheet('RECIBIDAS_GASTOS', RECEIVED_HEADERS, buildAeatReceivedRows(input), RECEIVED_MERGES);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (blob.size > MAX_BYTES) throw new Error('El fichero supera el máximo de 4 MB admitido por la AEAT.');
  return blob;
}

export function aeatBooksFileName(year: number, nif: string, name: string): string {
  const safeNif = normalizedTaxId(nif); const safeName = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
  return `${year}${safeNif}T${safeName}.xlsx`;
}

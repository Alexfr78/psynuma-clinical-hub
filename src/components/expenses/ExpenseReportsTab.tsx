import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Icon } from '@/components/ui/icon';
import { useExpenseIncomeStatementData, useExpensesForVatBook, quarterToDateRange, type QuarterRange } from '@/hooks/useExpenses';
import { createIncomeStatementExport } from '@/lib/export/expenseIncomeStatementExport';
import { createExpenseVatBookExport, type ExpenseForVatBookExport } from '@/lib/export/expenseVatBookExport';
import { downloadFile } from '@/lib/export/downloadFile';

const currentYear = new Date().getFullYear();
const currentQuarter = (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4;

export function ExpenseReportsTab() {
  const [range, setRange] = useState<QuarterRange>({ year: currentYear, quarter: currentQuarter });
  const { data, isLoading } = useExpenseIncomeStatementData(range);
  const { data: vatBookExpenses } = useExpensesForVatBook(range);
  const { label } = quarterToDateRange(range);

  const expensesTotal = data
    ? data.expensesFixedRecurring + data.expensesVariable + data.expensesSupplierInvoice + data.expensesProfessionalPayment
    : 0;
  const netResult = data ? data.income - expensesTotal : 0;
  const vatBalance = data ? data.vatOutput - data.vatInput : 0;

  const handleExportIncomeStatement = () => {
    if (!data) return;
    const { csv } = createIncomeStatementExport({ periodLabel: label, ...data });
    downloadFile(csv, `cuenta-resultados-${label.replace(' ', '-')}.csv`);
  };

  const handleExportVatBook = () => {
    const rows = (vatBookExpenses ?? []) as unknown as ExpenseForVatBookExport[];
    const { csv } = createExpenseVatBookExport(rows);
    downloadFile(csv, `libro-iva-soportado-${label.replace(' ', '-')}.csv`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Cuenta de resultados</CardTitle>
          <CardDescription>Ingresos, gastos e IVA/IRPF por trimestre</CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={String(range.year)} onValueChange={(v) => setRange((r) => ({ ...r, year: parseInt(v, 10) }))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(range.quarter)} onValueChange={(v) => setRange((r) => ({ ...r, quarter: parseInt(v, 10) as 1 | 2 | 3 | 4 }))}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">T1</SelectItem>
              <SelectItem value="2">T2</SelectItem>
              <SelectItem value="3">T3</SelectItem>
              <SelectItem value="4">T4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Ingresos (facturas emitidas)</span><span className="font-medium tabular-nums">{data.income.toFixed(2)} €</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Gastos</span><span className="tabular-nums">{expensesTotal.toFixed(2)} €</span></div>
              <div className="flex justify-between pl-4 text-xs text-muted-foreground"><span>— Fijos recurrentes</span><span className="tabular-nums">{data.expensesFixedRecurring.toFixed(2)} €</span></div>
              <div className="flex justify-between pl-4 text-xs text-muted-foreground"><span>— Variables</span><span className="tabular-nums">{data.expensesVariable.toFixed(2)} €</span></div>
              <div className="flex justify-between pl-4 text-xs text-muted-foreground"><span>— Facturas de proveedor</span><span className="tabular-nums">{data.expensesSupplierInvoice.toFixed(2)} €</span></div>
              <div className="flex justify-between pl-4 text-xs text-muted-foreground"><span>— Pagos a profesionales</span><span className="tabular-nums">{data.expensesProfessionalPayment.toFixed(2)} €</span></div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <span>Resultado neto</span>
                <span className={netResult >= 0 ? 'text-green-600' : 'text-destructive'}>{netResult.toFixed(2)} €</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>IVA repercutido (ventas)</span><span className="tabular-nums">{data.vatOutput.toFixed(2)} €</span></div>
              <div className="flex justify-between"><span>IVA soportado (compras)</span><span className="tabular-nums">{data.vatInput.toFixed(2)} €</span></div>
              <div className="flex justify-between font-medium">
                <span>IVA a ingresar/compensar</span>
                <span className="tabular-nums">{vatBalance.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-muted-foreground"><span>Retenciones IRPF en ventas</span><span className="tabular-nums">{data.irpfWithheldOnSales.toFixed(2)} €</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Retenciones IRPF en gastos</span><span className="tabular-nums">{data.irpfWithheldOnExpenses.toFixed(2)} €</span></div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={handleExportIncomeStatement} className="flex-1">
                <Icon name="file_download" className="h-4 w-4 mr-2" />
                Exportar cuenta de resultados (CSV)
              </Button>
              <Button variant="outline" onClick={handleExportVatBook} className="flex-1">
                <Icon name="file_download" className="h-4 w-4 mr-2" />
                Exportar libro de IVA soportado (CSV)
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

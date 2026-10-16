import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveDialog as Dialog, ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription, ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader, ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { useCenter } from '@/hooks/useCenter';
import { useAeatBooksData, type QuarterRange } from '@/hooks/useExpenses';
import { aeatBooksFileName, buildAeatBooksWorkbook, validateAeatBooks, type AeatBooksInput } from '@/lib/export/aeatBooksExport';

interface Props { open: boolean; onOpenChange: (open: boolean) => void }

function lastClosedQuarter(): QuarterRange {
  const now = new Date(); const current = Math.floor(now.getMonth() / 3) + 1;
  return current === 1 ? { year: now.getFullYear() - 1, quarter: 4 } : { year: now.getFullYear(), quarter: (current - 1) as 1 | 2 | 3 };
}

export function AeatBooksExportDialog({ open, onOpenChange }: Props) {
  const [range, setRange] = useState<QuarterRange>(lastClosedQuarter);
  const [isExporting, setIsExporting] = useState(false);
  const { center } = useCenter(); const { data, isLoading, error } = useAeatBooksData(range);
  const input = useMemo<AeatBooksInput | null>(() => center && data ? {
    center: { id: center.id, name: center.name, tax_id: center.tax_id, aeat_activity_code: center.aeat_activity_code, aeat_activity_type: center.aeat_activity_type, aeat_iae_epigraph: center.aeat_iae_epigraph },
    invoices: data.invoices, expenses: data.expenses, substitutions: data.substitutions, year: range.year, quarter: range.quarter,
  } : null, [center, data, range]);
  const issues = useMemo(() => input ? validateAeatBooks(input) : { errors: [], warnings: [] }, [input]);

  const handleDownload = async () => {
    if (!input || issues.errors.length) return;
    setIsExporting(true);
    try {
      const blob = await buildAeatBooksWorkbook(input);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = aeatBooksFileName(input.year, input.center.tax_id || '', input.center.name);
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      toast.success('Libros Registro AEAT descargados'); onOpenChange(false);
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : 'No se pudo generar el fichero AEAT');
    } finally { setIsExporting(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Libros Registro AEAT</DialogTitle><DialogDescription>Formato oficial para importar en Pre303, modelo 130 y Renta Web (autónomos).</DialogDescription></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="aeat-year">Ejercicio</Label><Select value={String(range.year)} onValueChange={(value) => setRange((current) => ({ ...current, year: Number(value) }))}><SelectTrigger id="aeat-year"><SelectValue /></SelectTrigger><SelectContent>{[range.year - 2, range.year - 1, range.year, range.year + 1].map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="aeat-quarter">Trimestre de cierre</Label><Select value={String(range.quarter)} onValueChange={(value) => setRange((current) => ({ ...current, quarter: Number(value) as 1 | 2 | 3 | 4 }))}><SelectTrigger id="aeat-quarter"><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4].map((quarter) => <SelectItem key={quarter} value={String(quarter)}>{quarter}T - acumulado desde el 1 de enero</SelectItem>)}</SelectContent></Select></div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Comprobando facturas y gastos...</p>}
      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">No se han podido cargar los datos. Vuelve a intentarlo.</p>}
      {(issues.errors.length > 0 || issues.warnings.length > 0) && <div className="space-y-3">
        {issues.errors.length > 0 && <section aria-labelledby="aeat-errors"><h3 id="aeat-errors" className="text-sm font-semibold text-destructive">Errores que bloquean la descarga ({issues.errors.length})</h3><ul className="mt-2 space-y-1 text-sm">{issues.errors.map((issue, index) => <li key={`${issue.type}-${issue.id}-${index}`} className="rounded-md border border-destructive/30 p-2">{issue.href ? <Link className="underline underline-offset-2" to={issue.href}>{issue.message}</Link> : issue.message}</li>)}</ul></section>}
        {issues.warnings.length > 0 && <section aria-labelledby="aeat-warnings"><h3 id="aeat-warnings" className="text-sm font-semibold text-amber-700 dark:text-amber-400">Avisos ({issues.warnings.length})</h3><ul className="mt-2 space-y-1 text-sm">{issues.warnings.map((issue, index) => <li key={`${issue.type}-${issue.id}-${index}`} className="rounded-md border border-amber-500/30 p-2">{issue.message}</li>)}</ul></section>}
      </div>}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={handleDownload} disabled={!input || isLoading || isExporting || issues.errors.length > 0}>{isExporting && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}Descargar libros (AEAT)</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

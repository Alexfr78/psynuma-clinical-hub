import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Download, Loader2 } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { buildCsv } from '@/lib/export/buildCsv';
import { downloadFile } from '@/lib/export/downloadFile';
import {
  buildInvoiceAccountingRows,
  INVOICE_CSV_COLUMNS,
  type AccountingExportInvoice,
  type AccountingSubstitutionReference,
  type AccountingVerifactuEvent,
  type AccountingVerifactuRecord,
} from '@/lib/export/invoiceAccountingExport';
import { toast } from 'sonner';

interface ExportInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportInvoicesDialog({ open, onOpenChange }: ExportInvoicesDialogProps) {
  const { center } = useCenter();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!dateFrom || !dateTo || !center?.id) {
      toast.error('Selecciona las fechas de inicio y fin');
      return;
    }

    setIsExporting(true);

    try {
      const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
      const dateToStr = format(dateTo, 'yyyy-MM-dd');

      // Build query with filters
      let query = supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          issue_date,
          due_date,
          cancellation_date,
          cancellation_reason,
          operation_date,
          subtotal,
          tax_rate,
          tax_amount,
          retention_amount,
          total,
          notes,
          status,
          is_valid,
          invoice_hash,
          previous_invoice_hash,
          verifactu_hash,
          verifactu_invoice_type,
          verifactu_pending,
          verifactu_registration_id,
          verifactu_timestamp,
          rectification_type,
          rectification_reason_code,
          rectified_invoice_id,
          correction_operation_id,
          recipient_snapshot,
          series_id,
          center_id,
          patient_id,
          patients:patient_id (first_name, last_name, tax_id, address, city, postal_code, email),
          series:series_id (name, invoice_type, series_type),
          rectified_invoice:rectified_invoice_id (id, invoice_number, issue_date),
          invoice_items (description, quantity, unit_price, total, tax_rate),
          payments (amount, payment_date, payment_method, notes, reference)
        `)
        .eq('center_id', center.id)
        .gte('issue_date', dateFromStr)
        .lte('issue_date', dateToStr)
        .order('issue_date', { ascending: true });

      // Cancelled and rectified invoices are fiscal evidence and must never disappear.
      if (!includeDrafts) {
        query = query.neq('status', 'draft');
      }

      const { data: invoices, error } = await query;

      if (error) throw error;

      if (!invoices || invoices.length === 0) {
        toast.warning('No hay facturas en el rango seleccionado');
        setIsExporting(false);
        return;
      }

      const invoiceIds = invoices.map((invoice) => invoice.id);
      let substitutionReferences: AccountingSubstitutionReference[] = [];
      let verifactuRecords: AccountingVerifactuRecord[] = [];
      let verifactuEvents: AccountingVerifactuEvent[] = [];

      if (invoiceIds.length > 0) {
        const [
          { data: substitutions, error: substitutionsError },
          { data: records, error: recordsError },
          { data: events, error: eventsError },
        ] = await Promise.all([
          supabase
            .from('invoice_substitutions')
            .select(`
              replacement_invoice_id, substituted_invoice_id,
              substituted_invoice:substituted_invoice_id (invoice_number, issue_date)
            `)
            .in('replacement_invoice_id', invoiceIds),
          supabase
            .from('verifactu_records')
            .select(`
              id, invoice_id, record_type, hash, previous_hash, aeat_status,
              aeat_csv, aeat_response_xml, xml_sent, created_at
            `)
            .in('invoice_id', invoiceIds)
            .order('created_at', { ascending: true }),
          supabase
            .from('verifactu_events')
            .select(`
              invoice_id, event_type, aeat_csv, aeat_response_code,
              aeat_response_xml, error_details, created_at
            `)
            .in('invoice_id', invoiceIds)
            .order('created_at', { ascending: true }),
        ]);

        if (substitutionsError) throw substitutionsError;
        if (recordsError) throw recordsError;
        if (eventsError) throw eventsError;

        substitutionReferences = (substitutions || []).flatMap((substitution) => {
          const replaced = substitution.substituted_invoice;
          if (!replaced?.invoice_number || !replaced.issue_date) return [];
          return [{
            replacement_invoice_id: substitution.replacement_invoice_id,
            substituted_invoice_id: substitution.substituted_invoice_id,
            invoice_number: replaced.invoice_number,
            issue_date: replaced.issue_date,
          }];
        });
        verifactuRecords = (records || []) as AccountingVerifactuRecord[];
        verifactuEvents = (events || []) as AccountingVerifactuEvent[];
      }

      const rows = buildInvoiceAccountingRows(
        invoices as unknown as AccountingExportInvoice[],
        substitutionReferences,
        verifactuRecords,
        verifactuEvents,
      );

      // Build CSV and download
      const csvContent = buildCsv(rows, INVOICE_CSV_COLUMNS, { quoteAllText: true });
      const filename = `psycma_invoices_${dateFromStr}_to_${dateToStr}.csv`;
      downloadFile(csvContent, filename);

      toast.success(`Exportadas ${rows.length} facturas`);
      onOpenChange(false);
    } catch (error) {
      console.error('Error exporting invoices:', error);
      toast.error('Error al exportar las facturas');
    } finally {
      setIsExporting(false);
    }
  };

  const isValid = dateFrom && dateTo && dateTo >= dateFrom;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar facturas</DialogTitle>
          <DialogDescription>
            Exporta las facturas del centro en formato CSV compatible con expense-scribe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date From */}
          <div className="space-y-2">
            <Label>Fecha inicio *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dateFrom && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label>Fecha fin *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dateTo && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  disabled={(date) => dateFrom ? date < dateFrom : false}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Las facturas anuladas y rectificadas se incluyen siempre por trazabilidad fiscal.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-drafts"
                checked={includeDrafts}
                onCheckedChange={(checked) => setIncludeDrafts(checked === true)}
              />
              <Label htmlFor="include-drafts" className="text-sm font-normal cursor-pointer">
                Incluir borradores
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!isValid || isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

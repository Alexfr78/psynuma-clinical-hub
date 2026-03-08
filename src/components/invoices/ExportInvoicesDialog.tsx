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
import { toast } from 'sonner';

interface ExportInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InvoiceExportRow {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string;
  client_name: string;
  client_tax_id: string;
  client_country: string;
  net_amount: string;
  vat_amount: string;
  irpf_retention: string;
  total_amount: string;
  currency: string;
  payment_status: string;
  payment_method: string;
  payment_date: string;
  payment_notes: string;
  vat_zone: string;
  vat_due_mode: string;
  import_format: string;
  psycma_invoice_id: string;
  psycma_center_id: string;
  psycma_series_id: string;
  psycma_status: string;
}

const CSV_COLUMNS: Array<{ key: keyof InvoiceExportRow; header: string }> = [
  { key: 'invoice_number', header: 'invoice_number' },
  { key: 'invoice_date', header: 'invoice_date' },
  { key: 'due_date', header: 'due_date' },
  { key: 'description', header: 'description' },
  { key: 'client_name', header: 'client_name' },
  { key: 'client_tax_id', header: 'client_tax_id' },
  { key: 'client_country', header: 'client_country' },
  { key: 'net_amount', header: 'net_amount' },
  { key: 'vat_amount', header: 'vat_amount' },
  { key: 'irpf_retention', header: 'irpf_retention' },
  { key: 'total_amount', header: 'total_amount' },
  { key: 'currency', header: 'currency' },
  { key: 'payment_status', header: 'payment_status' },
  { key: 'payment_method', header: 'payment_method' },
  { key: 'payment_date', header: 'payment_date' },
  { key: 'payment_notes', header: 'payment_notes' },
  { key: 'vat_zone', header: 'vat_zone' },
  { key: 'vat_due_mode', header: 'vat_due_mode' },
  { key: 'import_format', header: 'import_format' },
  { key: 'psycma_invoice_id', header: 'psycma_invoice_id' },
  { key: 'psycma_center_id', header: 'psycma_center_id' },
  { key: 'psycma_series_id', header: 'psycma_series_id' },
  { key: 'psycma_status', header: 'psycma_status' },
];

export function ExportInvoicesDialog({ open, onOpenChange }: ExportInvoicesDialogProps) {
  const { center } = useCenter();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [includeCancelled, setIncludeCancelled] = useState(false);
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
          subtotal,
          tax_amount,
          retention_amount,
          total,
          notes,
          status,
          is_valid,
          series_id,
          center_id,
          patient_id,
          patients:patient_id (first_name, last_name, tax_id),
          invoice_items (description, quantity, unit_price, total),
          payments (amount, payment_date, payment_method, notes, reference)
        `)
        .eq('center_id', center.id)
        .gte('issue_date', dateFromStr)
        .lte('issue_date', dateToStr)
        .order('issue_date', { ascending: true });

      // Apply status filters
      if (!includeCancelled) {
        query = query.neq('status', 'cancelled').eq('is_valid', true);
      }
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

      // Transform invoices to export format
      const rows: InvoiceExportRow[] = invoices.map((inv) => {
        const patient = inv.patients as { first_name?: string; last_name?: string; tax_id?: string } | null;
        const items = (inv.invoice_items || []) as Array<{ description: string; quantity: number; unit_price: number; total: number }>;
        const payments = (inv.payments || []) as Array<{ amount: number; payment_date: string; payment_method: string; notes?: string; reference?: string }>;

        // Build description from items
        const description = items.length > 0
          ? items.map(it => `${it.description} x${it.quantity} (${it.unit_price}€)`).join('; ')
          : inv.notes || '';

        // Calculate payment status
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const invoiceTotal = Number(inv.total) || 0;
        let paymentStatus = 'unpaid';
        if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
          paymentStatus = 'paid';
        } else if (totalPaid > 0) {
          paymentStatus = 'partial';
        }

        // Get payment method(s)
        let paymentMethod = '';
        if (payments.length > 0) {
          const methods = [...new Set(payments.map(p => p.payment_method))];
          paymentMethod = methods.length === 1 ? methods[0] : 'mixed';
        }

        // Get last payment date
        let paymentDate = '';
        if (payments.length > 0) {
          const dates = payments.map(p => p.payment_date).filter(Boolean).sort();
          paymentDate = dates.length > 0 ? dates[dates.length - 1] : '';
        }

        // Concatenate payment notes
        const paymentNotes = payments
          .map(p => [p.reference, p.notes].filter(Boolean).join(' - '))
          .filter(Boolean)
          .join('; ');

        const clientName = [patient?.first_name, patient?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();

        return {
          invoice_number: inv.invoice_number || '',
          invoice_date: inv.issue_date || '',
          due_date: inv.due_date || '',
          description,
          client_name: clientName,
          client_tax_id: patient?.tax_id || '',
          client_country: 'ES',
          net_amount: String(Number(inv.subtotal) || 0),
          vat_amount: String(Number(inv.tax_amount) || 0),
          irpf_retention: String(Number(inv.retention_amount) || 0),
          total_amount: String(Number(inv.total) || 0),
          currency: 'EUR',
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          payment_date: paymentDate,
          payment_notes: paymentNotes,
          vat_zone: '',
          vat_due_mode: '',
          import_format: 'psycma',
          psycma_invoice_id: inv.id,
          psycma_center_id: inv.center_id,
          psycma_series_id: inv.series_id || '',
          psycma_status: inv.status || '',
        };
      });

      // Build CSV and download
      const csvContent = buildCsv(rows, CSV_COLUMNS);
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-cancelled"
                checked={includeCancelled}
                onCheckedChange={(checked) => setIncludeCancelled(checked === true)}
              />
              <Label htmlFor="include-cancelled" className="text-sm font-normal cursor-pointer">
                Incluir anuladas/canceladas
              </Label>
            </div>
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

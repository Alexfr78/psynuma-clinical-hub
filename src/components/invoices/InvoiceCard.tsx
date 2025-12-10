import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, User, Download, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';

interface InvoiceCardProps {
  invoice: InvoiceWithPatient;
  onViewDetails?: () => void;
  onStatusChange?: (status: 'draft' | 'issued' | 'paid' | 'cancelled') => void;
  onGeneratePDF?: () => void;
}

const statusConfig = {
  draft: { label: 'Borrador', variant: 'secondary' as const },
  issued: { label: 'Emitida', variant: 'default' as const },
  paid: { label: 'Pagada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'destructive' as const },
};

export function InvoiceCard({ invoice, onViewDetails, onStatusChange, onGeneratePDF }: InvoiceCardProps) {
  const status = statusConfig[invoice.status] || statusConfig.draft;

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{invoice.invoice_number}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
                {invoice.is_recapitulative && (
                  <Badge variant="outline">Recapitulativa</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <User className="h-3 w-3" />
                <span>{invoice.patients.first_name} {invoice.patients.last_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(invoice.issue_date), "d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-bold">{Number(invoice.total).toFixed(2)}€</p>
              <p className="text-xs text-muted-foreground">
                Base: {Number(invoice.subtotal).toFixed(2)}€ + IVA {invoice.tax_rate}%
              </p>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={onGeneratePDF} title="Descargar PDF">
                <Download className="h-4 w-4" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onViewDetails}>
                    Ver detalles
                  </DropdownMenuItem>
                  {invoice.status === 'draft' && (
                    <DropdownMenuItem onClick={() => onStatusChange?.('issued')}>
                      Emitir factura
                    </DropdownMenuItem>
                  )}
                  {invoice.status === 'issued' && (
                    <DropdownMenuItem onClick={() => onStatusChange?.('paid')}>
                      Marcar como pagada
                    </DropdownMenuItem>
                  )}
                  {(invoice.status === 'draft' || invoice.status === 'issued') && (
                    <DropdownMenuItem 
                      onClick={() => onStatusChange?.('cancelled')}
                      className="text-destructive"
                    >
                      Cancelar factura
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

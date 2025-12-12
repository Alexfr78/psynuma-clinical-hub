import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, User, Download, MoreVertical, ShieldCheck, Search, FileX, FilePlus2, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';

interface InvoiceCardProps {
  invoice: InvoiceWithPatient;
  onViewDetails?: () => void;
  onStatusChange?: (status: 'draft' | 'issued' | 'paid' | 'cancelled') => void;
  onGeneratePDF?: () => void;
  onSealVerifactu?: () => void;
  onQueryVerifactu?: () => void;
  onCancelVerifactu?: () => void;
  onCreateRectificativa?: () => void;
  onRetryVerifactu?: () => void;
}

const statusConfig = {
  draft: { label: 'Borrador', variant: 'secondary' as const },
  issued: { label: 'Emitida', variant: 'default' as const },
  paid: { label: 'Pagada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'destructive' as const },
};

export function InvoiceCard({ 
  invoice, 
  onViewDetails, 
  onStatusChange, 
  onGeneratePDF, 
  onSealVerifactu,
  onQueryVerifactu,
  onCancelVerifactu,
  onCreateRectificativa,
  onRetryVerifactu
}: InvoiceCardProps) {
  const status = statusConfig[invoice.status] || statusConfig.draft;
  const isSealed = !!invoice.verifactu_registration_id; // Use registration_id as it confirms AEAT acceptance
  const isPendingVerifactu = invoice.verifactu_pending && !isSealed;
  const maxRetriesReached = (invoice.verifactu_retry_count || 0) >= 5;
  // Invoice is issued but NOT signed in Verifactu (needs signing)
  const needsVerifactuSign = invoice.status === 'issued' && !isSealed && !isPendingVerifactu;
  // Check if invoice has been invalidated (rectified)
  const isInvalidated = (invoice as any).is_valid === false;

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          {/* Top row: Icon, Info, and Actions */}
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0 hidden sm:flex">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className={cn("font-semibold text-sm sm:text-base", isInvalidated && "line-through text-muted-foreground")}>{invoice.invoice_number}</span>
                <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                {isInvalidated && (
                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Anulada</Badge>
                )}
                {invoice.is_recapitulative && (
                  <Badge variant="outline" className="text-xs hidden sm:inline-flex">Recap</Badge>
                )}
                {isSealed && (
                  <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700 text-xs">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="hidden sm:inline">Verifactu</span>
                  </Badge>
                )}
                {needsVerifactuSign && (
                  <Badge variant="outline" className="gap-1 border-orange-500 text-orange-600 text-xs">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="hidden sm:inline">Sin firmar</span>
                  </Badge>
                )}
                {isPendingVerifactu && !maxRetriesReached && (
                  <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 text-xs">
                    <Clock className="h-3 w-3" />
                    <span className="hidden sm:inline">Pendiente</span> ({invoice.verifactu_retry_count || 0}/5)
                  </Badge>
                )}
                {isPendingVerifactu && maxRetriesReached && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" />
                    Error
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mt-1">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{invoice.patients.first_name} {invoice.patients.last_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(invoice.issue_date), "d MMM yyyy", { locale: es })}
              </p>
            </div>

            {/* Amount and Actions - Right side */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="text-right">
                <p className="text-lg sm:text-xl font-bold">{Number(invoice.total).toFixed(2)}€</p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Base: {Number(invoice.subtotal).toFixed(2)}€
                </p>
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onGeneratePDF} title="Descargar PDF">
                  <Download className="h-4 w-4" />
                </Button>
              
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onViewDetails}>
                      Ver detalles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onGeneratePDF}>
                      Descargar PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {invoice.status === 'draft' && !isSealed && !isPendingVerifactu && (
                      <DropdownMenuItem onClick={onSealVerifactu} className="text-green-600">
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Sellar con Verifactu
                      </DropdownMenuItem>
                    )}
                    {needsVerifactuSign && (
                      <DropdownMenuItem onClick={onSealVerifactu} className="text-orange-600">
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        Firmar en Verifactu
                      </DropdownMenuItem>
                    )}
                    {isPendingVerifactu && (
                      <DropdownMenuItem onClick={onRetryVerifactu} className="text-amber-600">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reintentar Verifactu
                      </DropdownMenuItem>
                    )}
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
                    
                    {/* Verifactu actions for sealed invoices */}
                    {isSealed && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onQueryVerifactu}>
                          <Search className="h-4 w-4 mr-2" />
                          Consultar RF en AEAT
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onCreateRectificativa}>
                          <FilePlus2 className="h-4 w-4 mr-2" />
                          Crear Rectificativa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onCancelVerifactu} className="text-destructive">
                          <FileX className="h-4 w-4 mr-2" />
                          Anular RF en AEAT
                        </DropdownMenuItem>
                      </>
                    )}

                    {(invoice.status === 'draft' || invoice.status === 'issued') && !isSealed && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => onStatusChange?.('cancelled')}
                          className="text-destructive"
                        >
                          Cancelar factura
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

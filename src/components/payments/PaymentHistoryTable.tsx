import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, Banknote, ArrowRightLeft, Smartphone, Pencil, Trash2, Lock, CalendarDays, Link2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { PaymentWithRelations } from '@/hooks/usePayments';

interface PaymentHistoryTableProps {
  payments: PaymentWithRelations[];
  onEdit?: (payment: PaymentWithRelations) => void;
  onDelete?: (payment: PaymentWithRelations) => void;
  onLinkToInvoice?: (payment: PaymentWithRelations) => void;
}

const methodConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  cash: { label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  card: { label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  transfer: { label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  bizum: { label: 'Bizum', icon: <Smartphone className="h-4 w-4" /> },
};

export function PaymentHistoryTable({ payments, onEdit, onDelete, onLinkToInvoice }: PaymentHistoryTableProps) {
  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay pagos registrados
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Mobile view - Cards */}
      <div className="space-y-3 md:hidden">
        {payments.map((payment) => {
          const method = methodConfig[payment.payment_method] || methodConfig.cash;
          const hasInvoice = !!payment.invoice_id;
          const canEdit = !hasInvoice;

          return (
            <div key={payment.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">
                    {payment.patients.first_name} {payment.patients.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(payment.payment_date), "d MMM yyyy", { locale: es })}
                  </p>
                </div>
                <p className="text-lg font-bold">{Number(payment.amount).toFixed(2)}€</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {method.icon}
                  {method.label}
                </Badge>
                {payment.sessions && (
                  <Badge variant="secondary" className="gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(payment.sessions.session_date), "d MMM", { locale: es })}
                  </Badge>
                )}
                {payment.invoices?.invoice_number && (
                  <Badge variant="outline">{payment.invoices.invoice_number}</Badge>
                )}
              </div>

              {canEdit ? (
                <div className="flex items-center gap-2 pt-2 border-t">
                  {!hasInvoice && onLinkToInvoice && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => onLinkToInvoice(payment)}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Vincular
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onEdit?.(payment)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete?.(payment)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  Vinculado a factura
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop view - Table */}
      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Sesión</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const method = methodConfig[payment.payment_method] || methodConfig.cash;
              const hasInvoice = !!payment.invoice_id;

              return (
                <TableRow key={payment.id}>
                  <TableCell>
                    {format(new Date(payment.payment_date), "d MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {payment.patients.first_name} {payment.patients.last_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {method.icon}
                      {method.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {payment.invoices?.invoice_number || '-'}
                  </TableCell>
                  <TableCell>
                    {payment.sessions ? (
                      <Badge variant="secondary" className="gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(payment.sessions.session_date), "d MMM", { locale: es })}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {Number(payment.amount).toFixed(2)}€
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        {!hasInvoice && onLinkToInvoice && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onLinkToInvoice(payment)}
                              >
                                <Link2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Vincular a factura</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEdit?.(payment)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar pago</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => onDelete?.(payment)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar pago</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Vinculado a factura</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

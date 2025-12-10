import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, Banknote, ArrowRightLeft, Smartphone } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { PaymentWithRelations } from '@/hooks/usePayments';

interface PaymentHistoryTableProps {
  payments: PaymentWithRelations[];
}

const methodConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  cash: { label: 'Efectivo', icon: <Banknote className="h-4 w-4" /> },
  card: { label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" /> },
  transfer: { label: 'Transferencia', icon: <ArrowRightLeft className="h-4 w-4" /> },
  bizum: { label: 'Bizum', icon: <Smartphone className="h-4 w-4" /> },
};

export function PaymentHistoryTable({ payments }: PaymentHistoryTableProps) {
  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay pagos registrados
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Paciente</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead className="text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const method = methodConfig[payment.payment_method] || methodConfig.cash;
            
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
                <TableCell className="text-right font-semibold">
                  {Number(payment.amount).toFixed(2)}€
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

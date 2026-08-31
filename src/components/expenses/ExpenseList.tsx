import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import type { ExpenseKind, ExpenseStatus, ExpenseWithRelations } from '@/hooks/useExpenses';

interface ExpenseListProps {
  expenses: ExpenseWithRelations[] | undefined;
  isLoading: boolean;
  onEdit: (expense: ExpenseWithRelations) => void;
  onDelete: (expense: ExpenseWithRelations) => void;
  onMarkPaid: (expense: ExpenseWithRelations) => void;
}

const KIND_LABELS: Record<ExpenseKind, string> = {
  fixed_recurring: 'Fijo recurrente',
  variable: 'Variable',
  supplier_invoice: 'Factura proveedor',
  professional_payment: 'Pago a profesional',
};

function StatusBadge({ status }: { status: ExpenseStatus }) {
  if (status === 'paid') return <Badge className="bg-green-600 hover:bg-green-600/90">Pagado</Badge>;
  if (status === 'cancelled') return <Badge variant="secondary">Cancelado</Badge>;
  return <Badge variant="outline" className="border-amber-500 text-amber-600">Pendiente</Badge>;
}

export function ExpenseList({ expenses, isLoading, onEdit, onDelete, onMarkPaid }: ExpenseListProps) {
  const { isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (!expenses || expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <Icon name="payments" className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-semibold">Sin gastos registrados</h3>
        <p className="text-sm text-muted-foreground">Añade tu primer gasto o ajusta los filtros</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="hidden md:table-cell">Categoría</TableHead>
            <TableHead className="hidden lg:table-cell">Proveedor / Profesional</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell className="whitespace-nowrap">
                {format(new Date(expense.expense_date), 'dd MMM yyyy', { locale: es })}
              </TableCell>
              <TableCell className="max-w-[220px] truncate" title={expense.description}>
                {expense.description}
                <div className="text-xs text-muted-foreground md:hidden">{KIND_LABELS[expense.kind]}</div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {expense.category && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: expense.category.color }} />
                    {expense.category.name}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">
                {expense.professional
                  ? [expense.professional.first_name, expense.professional.last_name].filter(Boolean).join(' ')
                  : expense.supplier?.name || '—'}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {Number(expense.amount).toFixed(2)} €
                {expense.kind === 'professional_payment' && Number(expense.irpf_amount) > 0 && (
                  <div className="text-xs font-normal text-muted-foreground">
                    Neto: {(Number(expense.amount) - Number(expense.irpf_amount)).toFixed(2)} €
                  </div>
                )}
              </TableCell>
              <TableCell><StatusBadge status={expense.status} /></TableCell>
              <TableCell className="text-right">
                {(() => {
                  // Professionals cannot edit/mark-paid/delete a professional_payment
                  // settlement even when they are its beneficiary (RLS reserves that
                  // to admins) — hide the controls rather than offer an action that fails.
                  const canManage = isAdmin || expense.kind !== 'professional_payment';
                  // La RLS solo permite a un profesional no-admin editar sus
                  // gastos mientras siguen pendientes; el admin puede siempre.
                  const canEdit = isAdmin || (canManage && expense.status === 'pending');
                  return (
                    <div className="flex justify-end gap-1">
                      {canManage && expense.status === 'pending' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Marcar como pagado" onClick={() => onMarkPaid(expense)}>
                          <Icon name="check_circle" className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => onEdit(expense)}>
                          <Icon name="edit" className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && expense.status === 'pending' && expense.kind !== 'professional_payment' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Eliminar" onClick={() => onDelete(expense)}>
                          <Icon name="delete" className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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

const handleViewReceipt = async (expense: ExpenseWithRelations) => {
  if (expense.drive_url) {
    window.open(expense.drive_url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!expense.attachment_path) return;
  const { data, error } = await supabase.storage
    .from('expense-receipts')
    .createSignedUrl(expense.attachment_path, 60 * 5);
  if (error || !data?.signedUrl) {
    toast.error('No se pudo abrir el justificante');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
};

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
    <div className="rounded-lg border overflow-hidden">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20 px-2 sm:px-3">Fecha</TableHead>
            <TableHead className="px-2 sm:px-3">Descripción</TableHead>
            <TableHead className="hidden md:table-cell w-24 px-2 sm:px-3">Categoría</TableHead>
            <TableHead className="hidden lg:table-cell w-32 px-2 sm:px-3">Proveedor</TableHead>
            <TableHead className="text-right w-20 px-2 sm:px-3">Importe</TableHead>
            <TableHead className="w-[92px] px-2 sm:px-3">Estado</TableHead>
            <TableHead className="w-8 px-1 text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell className="px-2 sm:px-3 truncate whitespace-nowrap">
                {format(new Date(expense.expense_date), 'dd MMM', { locale: es })}
              </TableCell>
              <TableCell className="px-2 sm:px-3 truncate" title={expense.description}>
                {expense.description}
                <div className="text-xs text-muted-foreground md:hidden truncate">{KIND_LABELS[expense.kind]}</div>
              </TableCell>
              <TableCell className="hidden md:table-cell px-2 sm:px-3">
                {expense.category && (
                  <span className="inline-flex items-center gap-1.5 max-w-full truncate" title={expense.category.name}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: expense.category.color }} />
                    <span className="truncate">{expense.category.name}</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell px-2 sm:px-3 truncate text-muted-foreground" title={expense.professional ? [expense.professional.first_name, expense.professional.last_name].filter(Boolean).join(' ') : expense.supplier?.name || undefined}>
                {expense.professional
                  ? [expense.professional.first_name, expense.professional.last_name].filter(Boolean).join(' ')
                  : expense.supplier?.name || '—'}
              </TableCell>
              <TableCell className="px-2 sm:px-3 text-right font-medium tabular-nums truncate">
                {Number(expense.amount).toFixed(2)} €
                {expense.kind === 'professional_payment' && Number(expense.irpf_amount) > 0 && (
                  <div className="text-xs font-normal text-muted-foreground truncate">
                    Neto: {(Number(expense.amount) - Number(expense.irpf_amount)).toFixed(2)} €
                  </div>
                )}
              </TableCell>
              <TableCell className="px-2 sm:px-3 overflow-hidden"><StatusBadge status={expense.status} /></TableCell>
              <TableCell className="px-1 text-right">
                {(() => {
                  // Professionals cannot edit/mark-paid/delete a professional_payment
                  // settlement even when they are its beneficiary (RLS reserves that
                  // to admins) — hide the controls rather than offer an action that fails.
                  const canManage = isAdmin || expense.kind !== 'professional_payment';
                  // La RLS solo permite a un profesional no-admin editar sus
                  // gastos mientras siguen pendientes; el admin puede siempre.
                  const canEdit = isAdmin || (canManage && expense.status === 'pending');
                  const canDelete = canManage && expense.status === 'pending' && expense.kind !== 'professional_payment';
                  const hasActions = !!expense.attachment_path || (canManage && expense.status === 'pending') || canEdit || canDelete;
                  if (!hasActions) return null;
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Icon name="more_vert" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {expense.attachment_path && (
                          <DropdownMenuItem onClick={() => handleViewReceipt(expense)}>
                            <Icon name={expense.drive_url ? 'cloud_done' : 'attach_file'} className="h-4 w-4 mr-2" />
                            Ver justificante
                          </DropdownMenuItem>
                        )}
                        {canManage && expense.status === 'pending' && (
                          <DropdownMenuItem onClick={() => onMarkPaid(expense)}>
                            <Icon name="check_circle" className="h-4 w-4 mr-2 text-green-600" />
                            Marcar como pagado
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onClick={() => onEdit(expense)}>
                            <Icon name="edit" className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onDelete(expense)} className="text-destructive focus:text-destructive">
                              <Icon name="delete" className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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

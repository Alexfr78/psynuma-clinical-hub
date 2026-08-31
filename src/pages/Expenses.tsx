import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses, useDeleteExpense, useMarkExpensePaid, type ExpenseFilters, type ExpenseWithRelations } from '@/hooks/useExpenses';
import { ExpenseStatsCards } from '@/components/expenses/ExpenseStatsCards';
import { ExpenseFiltersBar } from '@/components/expenses/ExpenseFiltersBar';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { ExpenseReportsTab } from '@/components/expenses/ExpenseReportsTab';

export default function Expenses() {
  const { isAdmin } = useAuth();
  const [filters, setFilters] = useState<ExpenseFilters>({ month: new Date().toISOString().slice(0, 7) });
  const { data: expenses, isLoading } = useExpenses(filters);
  const deleteExpense = useDeleteExpense();
  const markPaid = useMarkExpensePaid();

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithRelations | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseWithRelations | null>(null);
  const [expenseToMarkPaid, setExpenseToMarkPaid] = useState<ExpenseWithRelations | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Gastos</h1>
          <p className="text-muted-foreground">Registra y controla los gastos del centro</p>
        </div>
        <Button onClick={() => { setEditingExpense(null); setFormOpen(true); }}>
          <Icon name="add" className="h-4 w-4 mr-2" />
          Nuevo gasto
        </Button>
      </div>

      <ExpenseStatsCards month={filters.month} />

      <Tabs defaultValue="list">
        {/* Los informes agregan ingresos completos del centro; para un
            profesional no-admin los gastos llegan filtrados por RLS y el
            resultado sería engañoso, además de exponer cifras de gestión. */}
        {isAdmin && (
          <TabsList>
            <TabsTrigger value="list">Listado</TabsTrigger>
            <TabsTrigger value="reports">Informes</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="list" className="space-y-4 mt-4">
          <ExpenseFiltersBar filters={filters} onChange={setFilters} />
          <ExpenseList
            expenses={expenses}
            isLoading={isLoading}
            onEdit={(expense) => { setEditingExpense(expense); setFormOpen(true); }}
            onDelete={(expense) => setExpenseToDelete(expense)}
            onMarkPaid={(expense) => setExpenseToMarkPaid(expense)}
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="reports" className="mt-4">
            <ExpenseReportsTab />
          </TabsContent>
        )}
      </Tabs>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editingExpense} />

      <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              {expenseToDelete && (
                <>Se eliminará el gasto <strong>{expenseToDelete.description}</strong> de <strong>{Number(expenseToDelete.amount).toFixed(2)} €</strong>. Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (expenseToDelete) {
                  await deleteExpense.mutateAsync(expenseToDelete.id);
                  setExpenseToDelete(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!expenseToMarkPaid} onOpenChange={(open) => !open && setExpenseToMarkPaid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como pagado?</AlertDialogTitle>
            <AlertDialogDescription>
              {expenseToMarkPaid && (
                <>
                  Se marcará <strong>{expenseToMarkPaid.description}</strong> ({Number(expenseToMarkPaid.amount).toFixed(2)} €) como pagado hoy.
                  {expenseToMarkPaid.kind === 'professional_payment' && Number(expenseToMarkPaid.irpf_amount) > 0 && (
                    <>
                      {' '}Importe bruto {Number(expenseToMarkPaid.amount).toFixed(2)} € − retención IRPF {Number(expenseToMarkPaid.irpf_amount).toFixed(2)} € = <strong>neto a pagar {(Number(expenseToMarkPaid.amount) - Number(expenseToMarkPaid.irpf_amount)).toFixed(2)} €</strong>.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (expenseToMarkPaid) {
                  await markPaid.mutateAsync({
                    id: expenseToMarkPaid.id,
                    paidAt: new Date().toISOString().split('T')[0],
                    paymentMethod: expenseToMarkPaid.payment_method || 'Transferencia',
                  });
                  setExpenseToMarkPaid(null);
                }
              }}
            >
              Marcar como pagado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

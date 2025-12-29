import { useState } from 'react';
import { CreditCard, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useDebts, useDebtStats } from '@/hooks/useDebts';
import { usePayments, usePaymentStats, useDeletePayment, PaymentWithRelations } from '@/hooks/usePayments';
import { DebtCard } from '@/components/payments/DebtCard';
import { PaymentHistoryTable } from '@/components/payments/PaymentHistoryTable';
import { RecordPaymentDialog } from '@/components/payments/RecordPaymentDialog';
import { EditPaymentDialog } from '@/components/payments/EditPaymentDialog';

export default function Payments() {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<{
    debtId?: string;
    patientId: string;
    amount: number;
    description?: string;
  } | null>(null);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithRelations | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentWithRelations | null>(null);

  const { data: debts, isLoading: debtsLoading } = useDebts();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: debtStats } = useDebtStats();
  const { data: paymentStats } = usePaymentStats();
  const deletePayment = useDeletePayment();

  const handleRecordPayment = (debtInfo: {
    debtId: string;
    patientId: string;
    pendingAmount: number;
    description?: string;
  }) => {
    setSelectedDebt({
      debtId: debtInfo.debtId,
      patientId: debtInfo.patientId,
      amount: debtInfo.pendingAmount,
      description: debtInfo.description,
    });
    setPaymentOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Cobros y Deudas</h1>
          <p className="text-muted-foreground">Gestiona pagos y deudas pendientes</p>
        </div>
        <Button onClick={() => { setSelectedDebt(null); setPaymentOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar pago
        </Button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Deuda pend.</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-destructive">{debtStats?.totalPending.toFixed(0) || '0'}€</p>
          </CardContent>
        </Card>
        <Card className={debtStats?.overdueCount ? 'border-destructive/50' : ''}>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              {debtStats?.overdueCount ? <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" /> : null}
              Vencido
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-destructive">{debtStats?.overdueAmount.toFixed(0) || '0'}€</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">{debtStats?.overdueCount || 0} vencidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Cobrado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{paymentStats?.totalAmount.toFixed(0) || '0'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pagos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{paymentStats?.count || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="debts">
        <TabsList>
          <TabsTrigger value="debts">Deudas pendientes</TabsTrigger>
          <TabsTrigger value="history">Historial de pagos</TabsTrigger>
        </TabsList>

        <TabsContent value="debts" className="mt-4">
          {debtsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : !debts || debts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin deudas pendientes</h3>
              <p className="text-sm text-muted-foreground">Todos los pagos están al día</p>
            </div>
          ) : (
            <div className="space-y-4">
              {debts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onRecordPayment={handleRecordPayment}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {paymentsLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <PaymentHistoryTable 
              payments={payments || []} 
              onEdit={(payment) => {
                setSelectedPayment(payment);
                setEditPaymentOpen(true);
              }}
              onDelete={(payment) => {
                setPaymentToDelete(payment);
                setDeleteDialogOpen(true);
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        preselectedDebtId={selectedDebt?.debtId}
        preselectedPatientId={selectedDebt?.patientId}
        preselectedAmount={selectedDebt?.amount}
        preselectedDescription={selectedDebt?.description}
      />

      <EditPaymentDialog
        open={editPaymentOpen}
        onOpenChange={setEditPaymentOpen}
        payment={selectedPayment}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              {paymentToDelete && (
                <>
                  Se eliminará el pago de <strong>{Number(paymentToDelete.amount).toFixed(2)}€</strong> de{' '}
                  <strong>{paymentToDelete.patients.first_name} {paymentToDelete.patients.last_name}</strong>.
                  {paymentToDelete.session_id && ' La sesión volverá a estado "Pendiente de pago".'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (paymentToDelete) {
                  await deletePayment.mutateAsync(paymentToDelete);
                  setPaymentToDelete(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from 'react';
import { CreditCard, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebts, useDebtStats } from '@/hooks/useDebts';
import { usePayments, usePaymentStats } from '@/hooks/usePayments';
import { DebtCard } from '@/components/payments/DebtCard';
import { PaymentHistoryTable } from '@/components/payments/PaymentHistoryTable';
import { RecordPaymentDialog } from '@/components/payments/RecordPaymentDialog';

export default function Payments() {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<{ patientId: string; amount: number } | null>(null);

  const { data: debts, isLoading: debtsLoading } = useDebts();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: debtStats } = useDebtStats();
  const { data: paymentStats } = usePaymentStats();

  const handleRecordPayment = (patientId: string, amount: number) => {
    setSelectedDebt({ patientId, amount });
    setPaymentOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Cobros y Deudas</h1>
          <p className="text-muted-foreground">Gestiona pagos y deudas pendientes</p>
        </div>
        <Button onClick={() => { setSelectedDebt(null); setPaymentOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar pago
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deuda pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{debtStats?.totalPending.toFixed(2) || '0.00'}€</p>
          </CardContent>
        </Card>
        <Card className={debtStats?.overdueCount ? 'border-destructive/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              {debtStats?.overdueCount ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
              Vencido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{debtStats?.overdueAmount.toFixed(2) || '0.00'}€</p>
            <p className="text-xs text-muted-foreground">{debtStats?.overdueCount || 0} deudas vencidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cobrado este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{paymentStats?.totalAmount.toFixed(2) || '0.00'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pagos este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{paymentStats?.count || 0}</p>
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
                  onRecordPayment={() => handleRecordPayment(
                    debt.patient_id,
                    Number(debt.amount) - Number(debt.paid_amount)
                  )}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {paymentsLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <PaymentHistoryTable payments={payments || []} />
          )}
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        preselectedPatientId={selectedDebt?.patientId}
        preselectedAmount={selectedDebt?.amount}
      />
    </div>
  );
}

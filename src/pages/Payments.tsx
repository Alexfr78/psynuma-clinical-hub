import { useState, useMemo } from 'react';
import { CreditCard, Plus, AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useDebts, useDebtStats, useDeleteDebt, DebtWithRelations } from '@/hooks/useDebts';
import { usePayments, usePaymentStats, useDeletePayment, PaymentWithRelations } from '@/hooks/usePayments';
import { DebtCard } from '@/components/payments/DebtCard';
import { PaymentHistoryTable } from '@/components/payments/PaymentHistoryTable';
import { RecordPaymentDialog } from '@/components/payments/RecordPaymentDialog';
import { AssignBonoToDebtDialog } from '@/components/payments/AssignBonoToDebtDialog';
import { EditPaymentDialog } from '@/components/payments/EditPaymentDialog';
import { SendPaymentReminderDialog } from '@/components/payments/SendPaymentReminderDialog';
import { LinkPaymentToInvoiceDialog } from '@/components/payments/LinkPaymentToInvoiceDialog';
import { CancellationChargesPanel } from '@/components/payments/CancellationChargesPanel';
import { SendInvoiceDialog } from '@/components/invoices/SendInvoiceDialog';
import { useCancellationCharges } from '@/hooks/useCancellationCharges';
import { format } from 'date-fns';

type InvoicePatient = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
};

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
  const [deleteDebtDialogOpen, setDeleteDebtDialogOpen] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<DebtWithRelations | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedDebtForReminder, setSelectedDebtForReminder] = useState<DebtWithRelations | null>(null);
  const [assignBonoDialogOpen, setAssignBonoDialogOpen] = useState(false);
  const [selectedDebtForBono, setSelectedDebtForBono] = useState<DebtWithRelations | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [paymentToLink, setPaymentToLink] = useState<PaymentWithRelations | null>(null);
  const [sendInvoiceDialogOpen, setSendInvoiceDialogOpen] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{
    id: string;
    invoice_number: string;
    total: number;
    patients: { id: string; first_name: string; last_name: string; email?: string | null; phone?: string | null };
  } | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const { data: debts, isLoading: debtsLoading } = useDebts();
  const { data: payments, isLoading: paymentsLoading } = usePayments();
  const { data: cancellationCharges } = useCancellationCharges();
  const { data: debtStats } = useDebtStats();
  const { data: paymentStats } = usePaymentStats();
  const deletePayment = useDeletePayment();
  const deleteDebt = useDeleteDebt();
  
  // Filter debts by patient name or invoice number
  const filteredDebts = useMemo(() => {
    if (!debts) return [];
    if (!searchQuery.trim()) return debts;
    
    const query = searchQuery.toLowerCase().trim();
    return debts.filter(debt => {
      const firstName = debt.patients?.first_name?.toLowerCase() || '';
      const lastName = debt.patients?.last_name?.toLowerCase() || '';
      const patientName = `${firstName} ${lastName}`.trim();
      const invoiceNumber = debt.invoices?.invoice_number?.toLowerCase() || '';
      const createdDate = debt.created_at ? format(new Date(debt.created_at), 'dd/MM/yyyy') : '';
      
      return patientName.includes(query) || 
             invoiceNumber.includes(query) ||
             createdDate.includes(query);
    });
  }, [debts, searchQuery]);
  
  // Filter payments by patient name, reference, or date
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    if (!searchQuery.trim()) return payments;
    
    const query = searchQuery.toLowerCase().trim();
    return payments.filter(payment => {
      const firstName = payment.patients?.first_name?.toLowerCase() || '';
      const lastName = payment.patients?.last_name?.toLowerCase() || '';
      const patientName = `${firstName} ${lastName}`.trim();
      const reference = payment.reference?.toLowerCase() || '';
      const invoiceNumber = payment.invoices?.invoice_number?.toLowerCase() || '';
      const paymentDate = payment.payment_date ? format(new Date(payment.payment_date), 'dd/MM/yyyy') : '';
      
      return patientName.includes(query) || 
             reference.includes(query) ||
             invoiceNumber.includes(query) ||
             paymentDate.includes(query);
    });
  }, [payments, searchQuery]);

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

  const handleDeleteDebt = (debt: DebtWithRelations) => {
    setDebtToDelete(debt);
    setDeleteDebtDialogOpen(true);
  };

  const handleSendReminder = (debt: DebtWithRelations) => {
    setSelectedDebtForReminder(debt);
    setReminderDialogOpen(true);
  };

  const handleAssignBono = (debt: DebtWithRelations) => {
    setSelectedDebtForBono(debt);
    setAssignBonoDialogOpen(true);
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
            <p className="text-lg sm:text-2xl font-bold text-green-600 tabular-nums">{paymentStats?.grossAmount.toFixed(0) || '0'}€</p>
            {!!paymentStats?.refundedAmount && (
              <p className="text-[10px] sm:text-xs text-destructive tabular-nums">
                −{paymentStats.refundedAmount.toFixed(0)}€ reembolsado · {paymentStats.totalAmount.toFixed(0)}€ neto
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pagos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{paymentStats?.grossCount || 0}</p>
            {!!paymentStats && paymentStats.grossCount !== paymentStats.count && (
              <p className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                {paymentStats.count} netos
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="debts">
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <TabsList className="w-full sm:w-auto justify-start overflow-x-auto flex-nowrap gap-1 h-auto p-1">
            <TabsTrigger value="debts" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Deudas pendientes</span>
              <span className="sm:hidden">Deudas</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Historial de pagos</span>
              <span className="sm:hidden">Historial</span>
            </TabsTrigger>
            <TabsTrigger value="cancellations" className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]">
              <span className="hidden sm:inline">Cancelaciones</span>
              <span className="sm:hidden">Canc.</span>
              {cancellationCharges && cancellationCharges.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] leading-none text-destructive-foreground">
                  {cancellationCharges.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Search bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between my-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, nº factura, fecha..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value="debts" className="mt-0">
          {debtsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : filteredDebts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin deudas pendientes</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim() ? 'No se encontraron deudas con ese criterio' : 'Todos los pagos están al día'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDebts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  onRecordPayment={handleRecordPayment}
                  onDelete={() => handleDeleteDebt(debt)}
                  onSendReminder={handleSendReminder}
                  onAssignBono={handleAssignBono}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          {paymentsLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <PaymentHistoryTable 
              payments={filteredPayments} 
              onEdit={(payment) => {
                setSelectedPayment(payment);
                setEditPaymentOpen(true);
              }}
              onDelete={(payment) => {
                setPaymentToDelete(payment);
                setDeleteDialogOpen(true);
              }}
              onLinkToInvoice={(payment) => {
                setPaymentToLink(payment);
                setLinkDialogOpen(true);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="cancellations" className="mt-0">
          <CancellationChargesPanel onRecordPayment={handleRecordPayment} />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        preselectedDebtId={selectedDebt?.debtId}
        preselectedPatientId={selectedDebt?.patientId}
        preselectedAmount={selectedDebt?.amount}
        preselectedDescription={selectedDebt?.description}
        onInvoiceCreated={async (invoiceId) => {
          // Fetch invoice details for SendInvoiceDialog
          const { data } = await (await import('@/integrations/supabase/client')).supabase
            .from('invoices')
            .select('id, invoice_number, total, patients:patient_id(id, first_name, last_name, email, phone)')
            .eq('id', invoiceId)
            .single();
          if (data) {
            const invoicePatient = data.patients as unknown as InvoicePatient;
            setCreatedInvoice({
              id: data.id,
              invoice_number: data.invoice_number || '',
              total: Number(data.total),
              patients: invoicePatient,
            });
            setSendInvoiceDialogOpen(true);
          }
        }}
      />

      <SendPaymentReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        debt={selectedDebtForReminder}
      />

      <AssignBonoToDebtDialog
        open={assignBonoDialogOpen}
        onOpenChange={(open) => {
          setAssignBonoDialogOpen(open);
          if (!open) setSelectedDebtForBono(null);
        }}
        debt={selectedDebtForBono}
      />

      <EditPaymentDialog
        open={editPaymentOpen}
        onOpenChange={setEditPaymentOpen}
        payment={selectedPayment}
      />

      <LinkPaymentToInvoiceDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        payment={paymentToLink}
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
                  {paymentToDelete.invoice_id && ' La deuda asociada a la factura se recomputará automáticamente.'}
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

      {/* Delete Debt Dialog */}
      <AlertDialog open={deleteDebtDialogOpen} onOpenChange={setDeleteDebtDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar deuda?</AlertDialogTitle>
            <AlertDialogDescription>
              {debtToDelete && (
                <>
                  Se eliminará la deuda de <strong>{(Number(debtToDelete.amount) - Number(debtToDelete.paid_amount)).toFixed(2)}€</strong> de{' '}
                  <strong>{debtToDelete.patients.first_name} {debtToDelete.patients.last_name}</strong>. Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (debtToDelete) {
                  await deleteDebt.mutateAsync(debtToDelete.id);
                  setDebtToDelete(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {createdInvoice && (
        <SendInvoiceDialog
          open={sendInvoiceDialogOpen}
          onOpenChange={(open) => {
            setSendInvoiceDialogOpen(open);
            if (!open) setCreatedInvoice(null);
          }}
          invoice={createdInvoice}
        />
      )}
    </div>
  );
}

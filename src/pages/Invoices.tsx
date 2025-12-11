import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useInvoices, useUpdateInvoiceStatus, useInvoiceStats, type InvoiceWithPatient } from '@/hooks/useInvoices';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoiceDetailDialog } from '@/components/invoices/InvoiceDetailDialog';
import { CreateSimpleInvoiceDialog } from '@/components/invoices/CreateSimpleInvoiceDialog';
import { CreateRecapInvoiceDialog } from '@/components/invoices/CreateRecapInvoiceDialog';
import { CreateRectificativaDialog } from '@/components/invoices/CreateRectificativaDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Invoices() {
  const [simpleOpen, setSimpleOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [rectificativaOpen, setRectificativaOpen] = useState(false);
  const [selectedInvoiceForRectificativa, setSelectedInvoiceForRectificativa] = useState<InvoiceWithPatient | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<{ id: string; number: string } | null>(null);
  
  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: invoices, isLoading, refetch } = useInvoices({ status: statusFilter === 'all' ? undefined : statusFilter });
  const { data: stats } = useInvoiceStats();
  const updateStatus = useUpdateInvoiceStatus();

  const handleStatusChange = async (id: string, status: 'draft' | 'issued' | 'paid' | 'cancelled') => {
    await updateStatus.mutateAsync({ id, status });
  };

  const handleGeneratePDF = async (invoiceId: string) => {
    try {
      toast.info('Generando PDF...');
      
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        printWindow.print();
      }
      
      toast.success('PDF generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  const handleSealVerifactu = async (invoiceId: string) => {
    try {
      toast.info('Sellando factura con Verifactu...');
      
      const { data, error } = await supabase.functions.invoke('seal-invoice-verifactu', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;

      toast.success(`Factura ${data.invoice_number} sellada correctamente`);
      refetch();
    } catch (error) {
      console.error('Error sealing invoice:', error);
      toast.error('Error al sellar la factura');
    }
  };

  const handleQueryVerifactu = async (invoiceId: string) => {
    try {
      toast.info('Consultando estado en AEAT...');
      
      const { data, error } = await supabase.functions.invoke('consulta-registro-verifactu', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;

      if (data.found) {
        toast.success(`Factura encontrada en AEAT. Estado: ${data.status}${data.csv ? `, CSV: ${data.csv}` : ''}`);
      } else {
        toast.warning(`Factura no encontrada en AEAT: ${data.error || 'Sin detalles'}`);
      }
    } catch (error) {
      console.error('Error querying Verifactu:', error);
      toast.error('Error al consultar en AEAT');
    }
  };

  const handleCancelVerifactuClick = (invoiceId: string, invoiceNumber: string) => {
    setInvoiceToCancel({ id: invoiceId, number: invoiceNumber });
    setCancelDialogOpen(true);
  };

  const handleCancelVerifactuConfirm = async () => {
    if (!invoiceToCancel) return;
    
    try {
      toast.info('Enviando anulación a AEAT...');
      
      const { data, error } = await supabase.functions.invoke('cancel-registro-facturacion', {
        body: { invoice_id: invoiceToCancel.id },
      });

      if (error) throw error;

      toast.success(`Factura ${data.invoice_number} anulada correctamente en AEAT`);
      refetch();
    } catch (error) {
      console.error('Error cancelling in Verifactu:', error);
      toast.error('Error al anular en AEAT');
    } finally {
      setCancelDialogOpen(false);
      setInvoiceToCancel(null);
    }
  };

  const handleCreateRectificativa = (invoice: InvoiceWithPatient) => {
    setSelectedInvoiceForRectificativa(invoice);
    setRectificativaOpen(true);
  };

  const handleViewDetails = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">Gestiona la facturación</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva factura
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSimpleOpen(true)}>
              Factura simple
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRecapOpen(true)}>
              Factura recapitulativa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Facturado este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalIssued.toFixed(2) || '0.00'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cobrado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats?.totalPaid.toFixed(2) || '0.00'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats?.totalPending.toFixed(2) || '0.00'}€</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="draft">Borrador</TabsTrigger>
          <TabsTrigger value="issued">Emitidas</TabsTrigger>
          <TabsTrigger value="paid">Pagadas</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin facturas</h3>
              <p className="text-sm text-muted-foreground">No hay facturas en esta categoría</p>
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.map(invoice => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  onViewDetails={() => handleViewDetails(invoice.id)}
                  onStatusChange={(status) => handleStatusChange(invoice.id, status)}
                  onGeneratePDF={() => handleGeneratePDF(invoice.id)}
                  onSealVerifactu={() => handleSealVerifactu(invoice.id)}
                  onQueryVerifactu={() => handleQueryVerifactu(invoice.id)}
                  onCancelVerifactu={() => handleCancelVerifactuClick(invoice.id, invoice.invoice_number)}
                  onCreateRectificativa={() => handleCreateRectificativa(invoice)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateSimpleInvoiceDialog open={simpleOpen} onOpenChange={setSimpleOpen} />
      <CreateRecapInvoiceDialog open={recapOpen} onOpenChange={setRecapOpen} />
      <CreateRectificativaDialog 
        open={rectificativaOpen} 
        onOpenChange={setRectificativaOpen}
        originalInvoice={selectedInvoiceForRectificativa}
      />
      
      <InvoiceDetailDialog 
        open={detailDialogOpen} 
        onOpenChange={setDetailDialogOpen}
        invoiceId={selectedInvoiceId}
      />

      {/* Confirmation dialog for Verifactu cancellation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular factura en AEAT?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a anular la factura <strong>{invoiceToCancel?.number}</strong> en el registro de AEAT (Verifactu). 
              Esta acción es irreversible y la factura quedará marcada como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelVerifactuConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Anular en AEAT
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

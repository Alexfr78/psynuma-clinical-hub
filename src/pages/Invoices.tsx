import { useState, useMemo } from 'react';
import { FileText, Plus, RefreshCw, ArrowUpDown, Hash, Calendar, Search, Download, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
import { useInvoices, useUpdateInvoiceStatus, useInvoiceStats, useDeleteDraftInvoice, type InvoiceWithPatient, type InvoiceSortField, type SortDirection } from '@/hooks/useInvoices';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoiceDetailDialog } from '@/components/invoices/InvoiceDetailDialog';
import { CreateSimpleInvoiceDialog } from '@/components/invoices/CreateSimpleInvoiceDialog';
import { CreateRecapInvoiceDialog } from '@/components/invoices/CreateRecapInvoiceDialog';
import { CreateRectificativaDialog } from '@/components/invoices/CreateRectificativaDialog';
import { SendInvoiceDialog } from '@/components/invoices/SendInvoiceDialog';
import { LinkPaymentsToInvoiceDialog } from '@/components/invoices/LinkPaymentsToInvoiceDialog';
import { ExportInvoicesDialog } from '@/components/invoices/ExportInvoicesDialog';
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
  const [newInvoiceMenuOpen, setNewInvoiceMenuOpen] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState<InvoiceSortField>('issue_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  
  // Send invoice dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedInvoiceForSend, setSelectedInvoiceForSend] = useState<InvoiceWithPatient | null>(null);
  
  // Link payments dialog state
  const [linkPaymentsDialogOpen, setLinkPaymentsDialogOpen] = useState(false);
  const [selectedInvoiceForLinkPayments, setSelectedInvoiceForLinkPayments] = useState<InvoiceWithPatient | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const { data: invoices, isLoading, refetch } = useInvoices({
    status: statusFilter === 'all' ? undefined : statusFilter,
    sortBy,
    sortDirection,
  });

  // Filter invoices by patient name, invoice number, or date
  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (!searchQuery.trim()) return invoices;
    
    const query = searchQuery.toLowerCase().trim();
    return invoices.filter(invoice => {
      const firstName = invoice.patients?.first_name?.toLowerCase() || '';
      const lastName = invoice.patients?.last_name?.toLowerCase() || '';
      const patientName = `${firstName} ${lastName}`.trim();
      const invoiceNumber = invoice.invoice_number?.toLowerCase() || '';
      // Format date for search (e.g., "15/01/2026", "15-01-2026", "2026-01-15")
      const issueDate = invoice.issue_date || '';
      const formattedDate = issueDate ? new Date(issueDate).toLocaleDateString('es-ES') : '';
      
      return patientName.includes(query) || 
             invoiceNumber.includes(query) ||
             issueDate.includes(query) ||
             formattedDate.includes(query);
    });
  }, [invoices, searchQuery]);
  
  // Count orphan invoices (issued/paid without verifactu_hash)
  const orphanCount = useMemo(() => {
    if (!invoices) return 0;
    return invoices.filter(inv => 
      (inv.status === 'issued' || inv.status === 'paid') && 
      !inv.verifactu_hash && 
      !inv.verifactu_pending &&
      !inv.invoice_number?.startsWith('BORRADOR-')
    ).length;
  }, [invoices]);
  
  const { data: stats } = useInvoiceStats();
  const updateStatus = useUpdateInvoiceStatus();
  const deleteDraft = useDeleteDraftInvoice();
  
  // Delete draft dialog state
  const [deleteDraftDialogOpen, setDeleteDraftDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<{ id: string; number: string } | null>(null);
  
  const handleSort = (field: InvoiceSortField) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };
  
  const getSortLabel = () => {
    const fieldLabel = sortBy === 'invoice_number' ? 'Número' : 'Fecha';
    const dirLabel = sortDirection === 'desc' ? '↓' : '↑';
    return `${fieldLabel} ${dirLabel}`;
  };

  const handleStatusChange = async (id: string, status: 'draft' | 'issued' | 'paid' | 'cancelled') => {
    await updateStatus.mutateAsync({ id, status });
  };

  const handleDeleteDraftClick = (invoice: InvoiceWithPatient) => {
    setInvoiceToDelete({ id: invoice.id, number: invoice.invoice_number });
    setDeleteDraftDialogOpen(true);
  };

  const handleConfirmDeleteDraft = async () => {
    if (!invoiceToDelete) return;
    await deleteDraft.mutateAsync(invoiceToDelete.id);
    setDeleteDraftDialogOpen(false);
    setInvoiceToDelete(null);
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
        
        // Wait for base64 images to render before printing
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      
      toast.success('PDF generado correctamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    }
  };

  const handleSealVerifactu = async (invoiceId: string) => {
    try {
      // First, get invoice status to determine which function to call
      const { data: invoice } = await supabase
        .from('invoices')
        .select('status, verifactu_registration_id')
        .eq('id', invoiceId)
        .single();

      // If invoice is already issued but not registered with AEAT, call sign directly
      if (invoice?.status === 'issued' && !invoice?.verifactu_registration_id) {
        toast.info('Firmando factura con Verifactu...');
        
        const { data, error } = await supabase.functions.invoke('sign-invoice-verifactu', {
          body: { invoice_id: invoiceId },
        });

        if (error) throw error;

        if (data.success) {
          toast.success(`Factura ${data.invoice_number} registrada en AEAT correctamente`);
        } else if (data.pending) {
          toast.warning(data.message || 'Factura pendiente de registro en AEAT');
        } else {
          throw new Error(data.error || 'Error desconocido');
        }
      } else {
        // For draft invoices, seal first then sign
        toast.info('Sellando factura con Verifactu...');
        
        const { data, error } = await supabase.functions.invoke('seal-invoice-verifactu', {
          body: { invoice_id: invoiceId },
        });

        if (error) throw error;

        toast.success(`Factura ${data.invoice_number} sellada correctamente`);
      }
      
      refetch();
    } catch (error) {
      console.error('Error sealing/signing invoice:', error);
      toast.error('Error al procesar la factura en Verifactu');
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

  const handleSendInvoice = (invoice: InvoiceWithPatient) => {
    setSelectedInvoiceForSend(invoice);
    setSendDialogOpen(true);
  };

  const handleLinkPayments = (invoice: InvoiceWithPatient) => {
    setSelectedInvoiceForLinkPayments(invoice);
    setLinkPaymentsDialogOpen(true);
  };

  const handleRetryVerifactu = async (invoiceId: string) => {
    try {
      toast.info('Reintentando registro en AEAT...');
      
      const { data, error } = await supabase.functions.invoke('sign-invoice-verifactu', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;

      if (data?.aeat_unavailable) {
        // AEAT is temporarily unavailable
        toast.info('La Agencia Tributaria no está disponible temporalmente. Se reintentará automáticamente más tarde.', {
          duration: 6000,
        });
      } else if (data?.success) {
        toast.success('Factura registrada correctamente en AEAT');
      } else if (data?.error) {
        toast.error(`Error de AEAT: ${data.error}`);
      }
      refetch();
    } catch (error) {
      console.error('Error retrying Verifactu:', error);
      toast.error('Error al reintentar el registro en AEAT');
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">Gestiona la facturación</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <DropdownMenu open={newInvoiceMenuOpen} onOpenChange={setNewInvoiceMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Nueva factura
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setNewInvoiceMenuOpen(false); setSimpleOpen(true); }}>
                Factura simple
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewInvoiceMenuOpen(false); setRecapOpen(true); }}>
                Factura recapitulativa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Facturado este mes</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{stats?.totalIssued.toFixed(0) || '0'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Facturas pagadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{stats?.totalPaid.toFixed(0) || '0'}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pendiente de cobro</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{stats?.totalPending.toFixed(0) || '0'}€</p>
          </CardContent>
        </Card>
      </div>

      {orphanCount > 0 && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Facturas sin registrar en AEAT</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Hay {orphanCount} factura{orphanCount > 1 ? 's' : ''} emitida{orphanCount > 1 ? 's' : ''} que no {orphanCount > 1 ? 'han' : 'ha'} sido registrada{orphanCount > 1 ? 's' : ''} en la Agencia Tributaria. 
            Esto puede causar huecos en la secuencia de Verifactu. Regístrelas desde el menú de cada factura.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="min-w-0 w-full overflow-hidden">
        <div className="relative min-w-0 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <TabsList className="w-full max-w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 gap-1 scrollbar-hide">
            <TabsTrigger value="all" className="shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">Todas</TabsTrigger>
            <TabsTrigger value="draft" className="shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">Borrador</TabsTrigger>
            <TabsTrigger value="issued" className="shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">Emitidas</TabsTrigger>
            <TabsTrigger value="paid" className="shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">Pagadas</TabsTrigger>
            <TabsTrigger value="verifactu_pending" className="gap-1 shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-2 min-h-[40px]">
              <RefreshCw className="h-3 w-3" />
              AEAT
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nº, cliente, fecha..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredInvoices.length} facturas
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="justify-center sm:justify-start">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">{sortBy === 'invoice_number' ? 'Nº' : 'Fecha'} {sortDirection === 'desc' ? '↓' : '↑'}</span>
                  <span className="hidden sm:inline">{getSortLabel()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSort('invoice_number')}>
                  <Hash className="h-4 w-4 mr-2" />
                  Número {sortBy === 'invoice_number' && (sortDirection === 'desc' ? '↓' : '↑')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('issue_date')}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Fecha {sortBy === 'issue_date' && (sortDirection === 'desc' ? '↓' : '↑')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value={statusFilter} className="mt-0">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin facturas</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim() ? 'No se encontraron facturas con ese criterio' : 'No hay facturas en esta categoría'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInvoices.map(invoice => (
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
                  onRetryVerifactu={() => handleRetryVerifactu(invoice.id)}
                  onSendInvoice={() => handleSendInvoice(invoice)}
                  onLinkPayments={() => handleLinkPayments(invoice)}
                  onDeleteDraft={() => handleDeleteDraftClick(invoice)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {simpleOpen && (
        <CreateSimpleInvoiceDialog open={simpleOpen} onOpenChange={setSimpleOpen} />
      )}
      {recapOpen && (
        <CreateRecapInvoiceDialog open={recapOpen} onOpenChange={setRecapOpen} />
      )}
      {rectificativaOpen && (
        <CreateRectificativaDialog 
          open={rectificativaOpen} 
          onOpenChange={setRectificativaOpen}
          originalInvoice={selectedInvoiceForRectificativa}
        />
      )}
      
      <SendInvoiceDialog 
        open={sendDialogOpen} 
        onOpenChange={setSendDialogOpen}
        invoice={selectedInvoiceForSend}
      />
      
      <LinkPaymentsToInvoiceDialog
        open={linkPaymentsDialogOpen}
        onOpenChange={setLinkPaymentsDialogOpen}
        invoice={selectedInvoiceForLinkPayments}
      />

      {detailDialogOpen && selectedInvoiceId && (
        <InvoiceDetailDialog 
          open={detailDialogOpen} 
          onOpenChange={setDetailDialogOpen}
          invoiceId={selectedInvoiceId}
        />
      )}

      {/* Confirmation dialog for Verifactu cancellation */}
      {cancelDialogOpen && (
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
      )}

      {/* Confirmation dialog for deleting draft */}
      {deleteDraftDialogOpen && (
        <AlertDialog open={deleteDraftDialogOpen} onOpenChange={setDeleteDraftDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar borrador?</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a eliminar el borrador <strong>{invoiceToDelete?.number}</strong>. 
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDeleteDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      
      <ExportInvoicesDialog 
        open={exportDialogOpen} 
        onOpenChange={setExportDialogOpen} 
      />
    </div>
  );
}

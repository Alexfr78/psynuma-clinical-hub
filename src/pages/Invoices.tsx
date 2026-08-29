import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { endOfMonth, format as formatDate, startOfMonth } from 'date-fns';
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
import {
  InvoiceAnalyticsCard,
  type InvoiceDateRange,
  type InvoiceGroupBy,
} from '@/components/invoices/InvoiceAnalyticsCard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hasInvoiceAeatRegistration } from '@/lib/invoice-immutability';
import { usePayments } from '@/hooks/usePayments';
import { downloadPdfFromUrl } from '@/lib/download-pdf';
import { Icon } from '@/components/ui/icon';

const getCurrentMonthRange = (): InvoiceDateRange => {
  const today = new Date();
  return {
    startDate: formatDate(startOfMonth(today), 'yyyy-MM-dd'),
    endDate: formatDate(endOfMonth(today), 'yyyy-MM-dd'),
  };
};

const INVOICE_PREFERENCES_STORAGE_KEY = 'psycma:invoices:preferences:v1';

type InvoicePreferences = {
  dateRange: InvoiceDateRange;
  groupBy: InvoiceGroupBy;
  statusFilter: string;
  sortBy: InvoiceSortField;
  sortDirection: SortDirection;
};

const validStatuses = new Set(['all', 'draft', 'issued', 'paid', 'verifactu_pending']);
const validGroupings = new Set<InvoiceGroupBy>(['day', 'week', 'month']);
const validSortFields = new Set<InvoiceSortField>(['issue_date', 'invoice_number']);
const validSortDirections = new Set<SortDirection>(['asc', 'desc']);

const isDateInputValue = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const getInitialInvoicePreferences = (): InvoicePreferences => {
  const dateRange = getCurrentMonthRange();
  const defaults: InvoicePreferences = {
    dateRange,
    groupBy: 'day',
    statusFilter: 'all',
    sortBy: 'issue_date',
    sortDirection: 'desc',
  };

  try {
    const rawPreferences = localStorage.getItem(INVOICE_PREFERENCES_STORAGE_KEY);
    if (!rawPreferences) return defaults;

    const saved = JSON.parse(rawPreferences) as Partial<InvoicePreferences>;
    const savedRange = saved.dateRange;
    const hasValidRange =
      isDateInputValue(savedRange?.startDate) &&
      isDateInputValue(savedRange?.endDate);

    return {
      dateRange: hasValidRange ? savedRange : defaults.dateRange,
      groupBy: saved.groupBy && validGroupings.has(saved.groupBy) ? saved.groupBy : defaults.groupBy,
      statusFilter: saved.statusFilter && validStatuses.has(saved.statusFilter) ? saved.statusFilter : defaults.statusFilter,
      sortBy: saved.sortBy && validSortFields.has(saved.sortBy) ? saved.sortBy : defaults.sortBy,
      sortDirection:
        saved.sortDirection && validSortDirections.has(saved.sortDirection)
          ? saved.sortDirection
          : defaults.sortDirection,
    };
  } catch {
    return defaults;
  }
};

export default function Invoices() {
  const [initialPreferences] = useState(getInitialInvoicePreferences);
  const [simpleOpen, setSimpleOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [rectificativaOpen, setRectificativaOpen] = useState(false);
  const [selectedInvoiceForRectificativa, setSelectedInvoiceForRectificativa] = useState<InvoiceWithPatient | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(initialPreferences.statusFilter);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<{ id: string; number: string } | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [newInvoiceMenuOpen, setNewInvoiceMenuOpen] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState<InvoiceSortField>(initialPreferences.sortBy);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialPreferences.sortDirection);
  
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
  const [invoiceDateRange, setInvoiceDateRange] = useState<InvoiceDateRange>(initialPreferences.dateRange);
  const [invoiceGroupBy, setInvoiceGroupBy] = useState<InvoiceGroupBy>(initialPreferences.groupBy);
  const [selectedChartBucket, setSelectedChartBucket] = useState<(InvoiceDateRange & { label: string }) | null>(null);

  useEffect(() => {
    const preferences: InvoicePreferences = {
      dateRange: invoiceDateRange,
      groupBy: invoiceGroupBy,
      statusFilter,
      sortBy,
      sortDirection,
    };

    try {
      localStorage.setItem(INVOICE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // The page still works when browser storage is disabled or unavailable.
    }
  }, [invoiceDateRange, invoiceGroupBy, sortBy, sortDirection, statusFilter]);

  const listDateRange = selectedChartBucket || invoiceDateRange;

  const { data: invoices, isLoading, refetch } = useInvoices({
    status: statusFilter === 'all' ? undefined : statusFilter,
    startDate: listDateRange.startDate,
    endDate: listDateRange.endDate,
    sortBy,
    sortDirection,
  });
  const { data: analyticsInvoices, isLoading: analyticsInvoicesLoading } = useInvoices({
    startDate: invoiceDateRange.startDate,
    endDate: invoiceDateRange.endDate,
    sortBy: 'issue_date',
    sortDirection: 'asc',
  });
  const { data: analyticsPayments, isLoading: analyticsPaymentsLoading } = usePayments({
    startDate: invoiceDateRange.startDate,
    endDate: invoiceDateRange.endDate,
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
      !hasInvoiceAeatRegistration(inv) &&
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

  const handleGeneratePDF = async (invoiceId: string, invoiceNumber?: string) => {
    try {
      toast.info('Generando PDF...');
      
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('PDF sin contenido');

      const ok = await downloadPdfFromUrl(data.url, `Factura-${invoiceNumber || invoiceId}`);
      if (!ok) {
        toast.error('El navegador ha bloqueado la descarga. Desactiva el bloqueador e inténtalo de nuevo.');
        return;
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
    setCancellationReason('');
    setCancelDialogOpen(true);
  };

  const handleCancelVerifactuConfirm = async () => {
    if (!invoiceToCancel) return;
    const normalizedReason = cancellationReason.trim();
    if (!normalizedReason) {
      toast.error('Indica el motivo de la anulación');
      return;
    }
    
    try {
      toast.info('Enviando anulación a AEAT...');
      
      const { data, error } = await supabase.functions.invoke('cancel-registro-facturacion', {
        body: {
          invoice_id: invoiceToCancel.id,
          cancellation_reason: normalizedReason,
        },
      });

      if (error) {
        let message = error.message;
        const context = 'context' in error ? error.context : null;

        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as {
              error?: string;
              details?: string;
              message?: string;
            };
            message = payload.error || payload.details || payload.message || message;
          } catch {
            // Keep the SDK error when the Edge Function did not return JSON.
          }
        }

        throw new Error(message);
      }

      toast.success(`Factura ${data.invoice_number} anulada correctamente en AEAT`);
      refetch();
    } catch (error) {
      console.error('Error cancelling in Verifactu:', error);
      toast.error(error instanceof Error ? error.message : 'Error al anular en AEAT');
    } finally {
      setCancelDialogOpen(false);
      setInvoiceToCancel(null);
      setCancellationReason('');
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

  // Support deep-linking to a specific invoice (e.g. from /cobros clicking an invoice number)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId');
    if (invoiceId) {
      handleViewDetails(invoiceId);
      const next = new URLSearchParams(searchParams);
      next.delete('invoiceId');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
            <Icon name="download" className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <DropdownMenu open={newInvoiceMenuOpen} onOpenChange={setNewInvoiceMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="flex-1 sm:flex-none">
                <Icon name="add" className="h-4 w-4 mr-2" />
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
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Facturado este mes (bruto)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{(stats?.totalIssued ?? 0).toFixed(2)}€</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
              Neto: {(stats?.totalIssuedNet ?? 0).toFixed(2)}€ · Retenciones IRPF: {(stats?.totalRetained ?? 0).toFixed(2)}€
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Facturas pagadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{(stats?.totalPaid ?? 0).toFixed(2)}€</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pendiente de cobro</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{(stats?.totalPending ?? 0).toFixed(2)}€</p>
          </CardContent>
        </Card>
      </div>


      {orphanCount > 0 && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <Icon name="warning" className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Facturas sin registrar en AEAT</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Hay {orphanCount} factura{orphanCount > 1 ? 's' : ''} emitida{orphanCount > 1 ? 's' : ''} que no {orphanCount > 1 ? 'han' : 'ha'} sido registrada{orphanCount > 1 ? 's' : ''} en la Agencia Tributaria. 
            Esto puede causar huecos en la secuencia de Verifactu. Regístrelas desde el menú de cada factura.
          </AlertDescription>
        </Alert>
      )}

      <InvoiceAnalyticsCard
        invoices={analyticsInvoices}
        payments={analyticsPayments}
        isLoading={analyticsInvoicesLoading || analyticsPaymentsLoading}
        range={invoiceDateRange}
        groupBy={invoiceGroupBy}
        selectedBucket={selectedChartBucket}
        onRangeChange={setInvoiceDateRange}
        onGroupByChange={setInvoiceGroupBy}
        onSelectedBucketChange={setSelectedChartBucket}
      />

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
              <Icon name="refresh" className="h-3 w-3" />
              AEAT
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="relative flex-1 max-w-xs">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  <Icon name="swap_vert" className="h-4 w-4 mr-2" />
                  <span className="sm:hidden">{sortBy === 'invoice_number' ? 'Nº' : 'Fecha'} {sortDirection === 'desc' ? '↓' : '↑'}</span>
                  <span className="hidden sm:inline">{getSortLabel()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSort('invoice_number')}>
                  <Icon name="tag" className="h-4 w-4 mr-2" />
                  Número {sortBy === 'invoice_number' && (sortDirection === 'desc' ? '↓' : '↑')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('issue_date')}>
                  <Icon name="calendar_month" className="h-4 w-4 mr-2" />
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
              <Icon name="description" className="h-12 w-12 text-muted-foreground" />
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
                  onGeneratePDF={() => handleGeneratePDF(invoice.id, invoice.invoice_number)}
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
            <Input
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              maxLength={500}
              placeholder="Motivo de la anulación"
              aria-label="Motivo de la anulación"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelVerifactuConfirm}
                disabled={!cancellationReason.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
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

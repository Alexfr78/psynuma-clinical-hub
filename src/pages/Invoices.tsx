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
import { useInvoices, useUpdateInvoiceStatus, useInvoiceStats } from '@/hooks/useInvoices';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { CreateSimpleInvoiceDialog } from '@/components/invoices/CreateSimpleInvoiceDialog';
import { CreateRecapInvoiceDialog } from '@/components/invoices/CreateRecapInvoiceDialog';
import { toast } from 'sonner';

export default function Invoices() {
  const [simpleOpen, setSimpleOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: invoices, isLoading } = useInvoices({ status: statusFilter === 'all' ? undefined : statusFilter });
  const { data: stats } = useInvoiceStats();
  const updateStatus = useUpdateInvoiceStatus();

  const handleStatusChange = async (id: string, status: 'draft' | 'issued' | 'paid' | 'cancelled') => {
    await updateStatus.mutateAsync({ id, status });
  };

  const handleGeneratePDF = (invoiceId: string) => {
    toast.info('Generación de PDF en desarrollo');
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
                  onStatusChange={(status) => handleStatusChange(invoice.id, status)}
                  onGeneratePDF={() => handleGeneratePDF(invoice.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateSimpleInvoiceDialog open={simpleOpen} onOpenChange={setSimpleOpen} />
      <CreateRecapInvoiceDialog open={recapOpen} onOpenChange={setRecapOpen} />
    </div>
  );
}

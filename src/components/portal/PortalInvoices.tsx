import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Icon } from '@/components/ui/icon';

export interface PortalInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  is_recapitulative: boolean | null;
  is_valid: boolean | null;
  access_token: string | null;
  retention_rate: number | null;
  retention_amount: number | null;
}

interface PortalInvoicesProps {
  invoices: PortalInvoice[];
  loading: boolean;
  sessionToken: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  issued: { label: 'Emitida', variant: 'default' },
  paid: { label: 'Pagada', variant: 'outline' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
};

export function PortalInvoices({ invoices, loading, sessionToken }: PortalInvoicesProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (invoice: PortalInvoice) => {
    if (!sessionToken) return;
    setDownloadingId(invoice.id);

    try {
      const { data, error } = await supabase.functions.invoke('patient-portal-invoices', {
        body: { action: 'download', sessionToken, invoiceId: invoice.id },
      });

      if (error || !data?.success || !data?.pdf?.url) {
        toast.error('Error al descargar la factura');
        return;
      }

      window.open(data.pdf.url, '_blank');
    } catch {
      toast.error('Error de conexión');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleView = (invoice: PortalInvoice) => {
    if (invoice.access_token) {
      window.open(`/factura/${invoice.access_token}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <Icon name="description" className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Sin facturas</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Aún no tienes facturas emitidas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => {
        const status = statusConfig[invoice.status] || statusConfig.issued;
        const isInvalidated = invoice.is_valid === false;

        return (
          <Card key={invoice.id} className={cn(
            "transition-colors",
            isInvalidated && "opacity-60"
          )}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon name="description" className="h-4 w-4 text-primary shrink-0" />
                    <span className={cn(
                      "font-medium text-sm",
                      isInvalidated && "line-through text-muted-foreground"
                    )}>
                      {invoice.invoice_number}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {isInvalidated && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">Anulada</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(invoice.issue_date), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-semibold">{Number(invoice.total).toFixed(2)}€</p>
                    <p className="text-xs text-muted-foreground">
                      Base: {Number(invoice.subtotal).toFixed(2)}€
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {invoice.access_token && (
                      <Button variant="outline" size="sm" className="min-h-11" onClick={() => handleView(invoice)}>
                        <Icon name="open_in_new" className="mr-2 h-4 w-4" aria-hidden="true" />Ver
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => handleDownload(invoice)}
                      disabled={downloadingId === invoice.id}
                    >
                      {downloadingId === invoice.id ? (
                        <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Icon name="download" className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      Descargar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

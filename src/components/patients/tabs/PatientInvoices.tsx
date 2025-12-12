import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PatientInvoicesProps {
  patientId: string;
}

const statusConfig = {
  draft: { label: 'Borrador', variant: 'secondary' as const },
  issued: { label: 'Emitida', variant: 'default' as const },
  paid: { label: 'Pagada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'destructive' as const },
};

export function PatientInvoices({ patientId }: PatientInvoicesProps) {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['patient-invoices', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('patient_id', patientId)
        .order('issue_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
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
        <FileText className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-display text-lg font-semibold">Sin facturas</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Este paciente aún no tiene facturas emitidas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {invoices.map((invoice) => {
        const status = statusConfig[invoice.status as keyof typeof statusConfig] || statusConfig.draft;
        const isInvalidated = (invoice as any).is_valid === false;
        
        return (
          <Card key={invoice.id} className={cn(
            "transition-colors hover:bg-muted/50",
            isInvalidated && "opacity-60"
          )}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className={cn("font-medium", isInvalidated && "line-through text-muted-foreground")}>
                      {invoice.invoice_number}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {isInvalidated && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">Anulada</Badge>
                    )}
                    {invoice.is_recapitulative && (
                      <Badge variant="outline">Recapitulativa</Badge>
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    Emitida el {format(new Date(invoice.issue_date), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-semibold">{Number(invoice.total).toFixed(2)}€</p>
                    <p className="text-xs text-muted-foreground">
                      Base: {Number(invoice.subtotal).toFixed(2)}€ + IVA {invoice.tax_rate}%
                    </p>
                  </div>
                  
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

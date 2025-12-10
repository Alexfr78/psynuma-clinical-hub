import { Save, Loader2, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';

export function InvoiceAutomationSection() {
  const { center, updateCenter } = useCenter();
  const { isAdmin } = useAuth();

  const handleToggle = (enabled: boolean) => {
    updateCenter.mutate({ auto_invoicing_enabled: enabled });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatizar facturas</CardTitle>
        <CardDescription>
          Configura la generación automática de facturas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-2">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="auto-invoicing" className="text-base font-medium">
                Facturación automática
              </Label>
              <p className="text-sm text-muted-foreground">
                Genera automáticamente una factura recapitulativa al final de cada mes 
                con todas las sesiones completadas de cada paciente.
              </p>
            </div>
          </div>
          {isAdmin ? (
            <Switch
              id="auto-invoicing"
              checked={center?.auto_invoicing_enabled || false}
              onCheckedChange={handleToggle}
              disabled={updateCenter.isPending}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {center?.auto_invoicing_enabled ? 'Activado' : 'Desactivado'}
            </span>
          )}
        </div>

        {center?.auto_invoicing_enabled && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <h4 className="font-medium text-sm">¿Cómo funciona?</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary font-medium">1.</span>
                Al finalizar cada mes, el sistema recopila todas las sesiones completadas que no han sido facturadas.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-medium">2.</span>
                Se agrupa por paciente y se genera una factura recapitulativa para cada uno.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-medium">3.</span>
                Las facturas se crean en estado "borrador" para que puedas revisarlas antes de enviarlas.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-medium">4.</span>
                Se usa la serie predeterminada configurada en "Series y numeración".
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { PortalPaymentMethod as PaymentMethod } from '@/hooks/usePatientPortal';
import { Icon } from '@/components/ui/icon';

interface PortalPaymentMethodProps {
  getPaymentMethod: () => Promise<PaymentMethod | null>;
  removePaymentMethod: () => Promise<boolean>;
}

// Fase 2 · Inc 1 — muestra la tarjeta guardada del paciente y permite quitarla.
export function PortalPaymentMethod({ getPaymentMethod, removePaymentMethod }: PortalPaymentMethodProps) {
  const [card, setCard] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    getPaymentMethod().then((c) => {
      if (active) {
        setCard(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
    // Cargar una vez al montar; el token del portal es estable tras el login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = async () => {
    setRemoving(true);
    const ok = await removePaymentMethod();
    setRemoving(false);
    if (ok) {
      setCard(null);
      toast.success('Tarjeta eliminada');
    } else {
      toast.error('No se pudo eliminar la tarjeta');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-28 items-center justify-center" role="status" aria-live="polite">
          <Icon name="progress_activity" className="mr-2 h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Cargando método de pago...</span>
        </CardContent>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="credit_card" className="h-4 w-4" aria-hidden="true" />
            Método de pago
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            No tienes ninguna tarjeta guardada. Si una reserva la necesita, podrás añadirla durante ese proceso seguro.
          </p>
        </CardContent>
      </Card>
    );
  }

  const brand = card.brand
    ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
    : 'Tarjeta';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon name="credit_card" className="h-4 w-4" />
          Medios de pago
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">{brand} ···· {card.last4}</span>
          {card.exp_month && card.exp_year && (
            <span className="text-muted-foreground">
              {' '}· Caduca {String(card.exp_month).padStart(2, '0')}/{card.exp_year}
            </span>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-11" disabled={removing}>
              {removing ? <Icon name="progress_activity" className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon name="delete" className="mr-1 h-4 w-4" aria-hidden="true" />}
              Quitar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitar la tarjeta guardada?</AlertDialogTitle>
              <AlertDialogDescription>
                El centro dejará de poder utilizarla para los cargos autorizados asociados a cancelaciones o ausencias. Podrás guardar otra tarjeta cuando una reserva lo requiera.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Volver</AlertDialogCancel>
              <AlertDialogAction
                disabled={removing}
                onClick={() => void handleRemove()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Quitar tarjeta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

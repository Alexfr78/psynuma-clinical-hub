import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { PortalPaymentMethod as PaymentMethod } from '@/hooks/usePatientPortal';

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

  // Sin tarjeta guardada (o cargando) no ocupamos espacio en el portal.
  if (loading || !card) return null;

  const brand = card.brand
    ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1)
    : 'Tarjeta';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
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
        <Button variant="outline" size="sm" onClick={handleRemove} disabled={removing}>
          {removing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
          Quitar
        </Button>
      </CardContent>
    </Card>
  );
}

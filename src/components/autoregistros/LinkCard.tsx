import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, XCircle, Trash2, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroLink } from '@/hooks/useAutoregistroLinks';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useAuth } from '@/hooks/useAuth';

interface LinkCardProps {
  link: AutoregistroLink;
  onDeactivate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function LinkCard({ link, onDeactivate, onDelete }: LinkCardProps) {
  const url = `${window.location.origin}/registro/${link.access_token}`;
  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
  const statusLabel = link.status === 'active' && !isExpired ? 'Activo' : 'Expirado';
  const statusVariant = statusLabel === 'Activo' ? 'default' : 'secondary';
  const [sending, setSending] = useState(false);

  const { sendWhatsApp, getManualLink } = useWhatsAppDelivery();
  const { profile } = useAuth();

  const patient = link.patient as { first_name?: string; last_name?: string; phone?: string | null } | null;
  const patientName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim();
  const patientPhone = patient?.phone as string | null;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success('Enlace copiado');
  };

  const handleWhatsApp = async () => {
    const message = `Hola ${patient?.first_name ?? ''}, aquí tienes el enlace para tu autorregistro:\n${url}`;

    if (!patientPhone) {
      // Fallback: open manual link with just the message (no phone)
      const manualLink = getManualLink('', message);
      window.open(manualLink, '_blank');
      return;
    }

    setSending(true);
    try {
      const { result, manualLink } = await sendWhatsApp({
        phone: patientPhone,
        message,
        patientId: link.patient_id,
        patientName,
        centerId: link.center_id,
        messageType: 'autoregistro_link',
      });

      if (!result.autoSent && manualLink) {
        window.open(manualLink, '_blank');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{patientName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {(link.template as { name?: string })?.name}
            </p>
          </div>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Creado: {format(new Date(link.created_at), 'dd MMM yyyy', { locale: es })}
          {link.expires_at && (
            <> · Expira: {format(new Date(link.expires_at), 'dd MMM yyyy', { locale: es })}</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-3 w-3 mr-1" /> Copiar enlace
          </Button>
          {link.status === 'active' && !isExpired && (
            <Button variant="outline" size="sm" onClick={handleWhatsApp} disabled={sending}>
              {sending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <MessageCircle className="h-3 w-3 mr-1" />
              )}
              WhatsApp
            </Button>
          )}
          {link.status === 'active' && !isExpired && (
            <Button variant="ghost" size="sm" onClick={() => onDeactivate(link.id)}>
              <XCircle className="h-3 w-3 mr-1" /> Desactivar
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(link.id)}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Eliminar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

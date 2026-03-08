import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroLink } from '@/hooks/useAutoregistroLinks';

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

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success('Enlace copiado');
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {(link.patient as any)?.first_name} {(link.patient as any)?.last_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {(link.template as any)?.name}
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-3 w-3 mr-1" /> Copiar enlace
          </Button>
          {link.status === 'active' && !isExpired && (
            <Button variant="ghost" size="sm" onClick={() => onDeactivate(link.id)}>
              <XCircle className="h-3 w-3 mr-1" /> Desactivar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

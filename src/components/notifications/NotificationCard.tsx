import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mail, MessageSquare, Phone, Clock, CheckCircle, XCircle, Send } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NotificationWithRelations } from '@/hooks/useNotifications';

interface NotificationCardProps {
  notification: NotificationWithRelations;
  onSend?: (id: string) => void;
}

const typeConfig = {
  email: { icon: Mail, label: 'Email', color: 'bg-blue-500/10 text-blue-600' },
  sms: { icon: Phone, label: 'SMS', color: 'bg-green-500/10 text-green-600' },
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'bg-emerald-500/10 text-emerald-600' },
};

const statusConfig = {
  pending: { icon: Clock, label: 'Pendiente', variant: 'secondary' as const },
  sent: { icon: CheckCircle, label: 'Enviado', variant: 'default' as const },
  failed: { icon: XCircle, label: 'Fallido', variant: 'destructive' as const },
};

export function NotificationCard({ notification, onSend }: NotificationCardProps) {
  const typeInfo = typeConfig[notification.type];
  const statusInfo = statusConfig[notification.status || 'pending'];
  const TypeIcon = typeInfo.icon;
  const StatusIcon = statusInfo.icon;

  const patientName = notification.patients
    ? `${notification.patients.first_name} ${notification.patients.last_name}`
    : 'Paciente desconocido';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${typeInfo.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{patientName}</p>
              <p className="text-sm text-muted-foreground">{notification.recipient}</p>
            </div>
          </div>
          <Badge variant={statusInfo.variant} className="flex items-center gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {notification.subject && (
          <p className="font-medium text-sm">{notification.subject}</p>
        )}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            {notification.scheduled_for && (
              <span>
                Programado: {format(new Date(notification.scheduled_for), "dd/MM/yyyy HH:mm", { locale: es })}
              </span>
            )}
            {notification.sent_at && (
              <span>
                Enviado: {format(new Date(notification.sent_at), "dd/MM/yyyy HH:mm", { locale: es })}
              </span>
            )}
          </div>
          
          {notification.status === 'pending' && onSend && (
            <Button size="sm" variant="outline" onClick={() => onSend(notification.id)}>
              <Send className="h-3 w-3 mr-1" />
              Enviar ahora
            </Button>
          )}
        </div>

        {notification.error_message && (
          <p className="text-xs text-destructive">
            Error: {notification.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

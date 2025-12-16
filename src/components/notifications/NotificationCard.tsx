import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mail, MessageSquare, Phone, Clock, CheckCircle, XCircle, Send, Smartphone } from 'lucide-react';
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

  // Check if this is a WhatsApp notification that requires manual sending
  const isWhatsAppManualSend = notification.type === 'whatsapp' && notification.status === 'pending';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-2 rounded-lg flex-shrink-0 ${typeInfo.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{patientName}</p>
              <p className="text-sm text-muted-foreground truncate">{notification.recipient}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isWhatsAppManualSend && (
              <Badge variant="outline" className="text-xs flex items-center gap-1 text-amber-600 border-amber-300">
                <Smartphone className="h-3 w-3" />
                <span className="hidden sm:inline">Envío manual</span>
                <span className="sm:hidden">Manual</span>
              </Badge>
            )}
            <Badge variant={statusInfo.variant} className="flex items-center gap-1 w-fit">
              <StatusIcon className="h-3 w-3" />
              <span className="hidden sm:inline">{statusInfo.label}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-hidden">
        {notification.subject && (
          <p className="font-medium text-sm truncate break-words">{notification.subject}</p>
        )}
        <p className="text-sm text-muted-foreground line-clamp-2 break-words">
          {notification.message}
        </p>
        
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            {notification.scheduled_for && (
              <span className="truncate">
                <span className="hidden sm:inline">Programado:</span>
                <span className="sm:hidden">Prog:</span>
                {' '}{format(new Date(notification.scheduled_for), "dd/MM HH:mm", { locale: es })}
              </span>
            )}
            {notification.sent_at && (
              <span className="truncate">
                <span className="hidden sm:inline">Enviado:</span>
                <span className="sm:hidden">Env:</span>
                {' '}{format(new Date(notification.sent_at), "dd/MM HH:mm", { locale: es })}
              </span>
            )}
          </div>
          
          {notification.status === 'pending' && onSend && (
            <Button size="sm" variant="outline" onClick={() => onSend(notification.id)} className="w-full sm:w-auto">
              <Send className="h-3 w-3 mr-1" />
              {isWhatsAppManualSend ? (
                <>
                  <span className="hidden sm:inline">Abrir WhatsApp</span>
                  <span className="sm:hidden">WhatsApp</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Enviar ahora</span>
                  <span className="sm:hidden">Enviar</span>
                </>
              )}
            </Button>
          )}
        </div>

        {notification.error_message && (
          <p className="text-xs text-destructive truncate">
            Error: {notification.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

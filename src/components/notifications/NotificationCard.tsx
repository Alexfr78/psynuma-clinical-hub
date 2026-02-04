import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mail, MessageSquare, Phone, Clock, CheckCircle, XCircle, Send, Smartphone, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NotificationWithRelations } from '@/hooks/useNotifications';

interface NotificationCardProps {
  notification: NotificationWithRelations;
  onSend?: (id: string) => void;
  onDelete?: (id: string) => void;
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

export function NotificationCard({ notification, onSend, onDelete }: NotificationCardProps) {
  const typeInfo = typeConfig[notification.type];
  const statusInfo = statusConfig[notification.status || 'pending'];
  const TypeIcon = typeInfo.icon;
  const StatusIcon = statusInfo.icon;

  const patientName = notification.patients
    ? `${notification.patients.first_name} ${notification.patients.last_name}`
    : 'Contacto desconocido';

  // Check if this is a WhatsApp notification that requires manual sending
  const isWhatsAppManualSend = notification.type === 'whatsapp' && notification.status === 'pending';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`p-2 rounded-lg flex-shrink-0 ${typeInfo.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{patientName}</p>
              <p className="text-xs text-muted-foreground truncate">{notification.recipient}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isWhatsAppManualSend && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 text-amber-600 border-amber-300">
                <Smartphone className="h-3 w-3" />
                <span className="hidden lg:inline">Manual</span>
              </Badge>
            )}
            <Badge variant={statusInfo.variant} className="text-[10px] px-1.5 py-0.5 flex items-center gap-1">
              <StatusIcon className="h-3 w-3" />
            </Badge>
            {onDelete && (
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={() => onDelete(notification.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2 pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
          {notification.message}
        </p>
        
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mt-auto">
          <span className="truncate">
            {notification.scheduled_for 
              ? format(new Date(notification.scheduled_for), "dd/MM HH:mm", { locale: es })
              : notification.sent_at 
                ? format(new Date(notification.sent_at), "dd/MM HH:mm", { locale: es })
                : ''
            }
          </span>
          
          {notification.status === 'pending' && onSend && (
            <Button size="sm" variant="outline" onClick={() => onSend(notification.id)} className="h-7 text-xs px-2">
              <Send className="h-3 w-3 mr-1" />
              {isWhatsAppManualSend ? 'WhatsApp' : 'Enviar'}
            </Button>
          )}
        </div>

        {notification.error_message && (
          <p className="text-[10px] text-destructive truncate">
            Error: {notification.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

import { Mail, MessageSquare, Phone, Settings2, Zap, Link2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';

interface NotificationSettingsProps {
  // Immediate notifications (send now)
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  onNotifyWhatsappChange: (checked: boolean) => void;
  onNotifyEmailChange: (checked: boolean) => void;
  onNotifySmsChange: (checked: boolean) => void;
  // Reminders (scheduled)
  reminderWhatsapp: boolean;
  reminderEmail: boolean;
  reminderSms: boolean;
  onReminderWhatsappChange: (checked: boolean) => void;
  onReminderEmailChange: (checked: boolean) => void;
  onReminderSmsChange: (checked: boolean) => void;
  // Request confirmation
  requestConfirmation?: boolean;
  onRequestConfirmationChange?: (checked: boolean) => void;
  // Compact mode for smaller spaces
  compact?: boolean;
}

export function SessionNotificationSettings({
  notifyWhatsapp,
  notifyEmail,
  notifySms,
  onNotifyWhatsappChange,
  onNotifyEmailChange,
  onNotifySmsChange,
  reminderWhatsapp,
  reminderEmail,
  reminderSms,
  onReminderWhatsappChange,
  onReminderEmailChange,
  onReminderSmsChange,
  requestConfirmation,
  onRequestConfirmationChange,
  compact = false,
}: NotificationSettingsProps) {
  const { deliveryMethod, methodLabel, statusInfo, isAutomatic } = useWhatsAppDelivery();

  if (compact) {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Comunicaciones</span>
          <Badge variant={statusInfo.variant} className="text-xs flex items-center gap-1">
            {isAutomatic ? <Zap className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
            {statusInfo.label}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Notifications column */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Notificar ahora</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={notifyWhatsapp} 
                  onCheckedChange={(checked) => onNotifyWhatsappChange(!!checked)}
                />
                <MessageSquare className="h-3.5 w-3.5 text-green-600" />
                <span>WhatsApp</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={notifyEmail} 
                  onCheckedChange={(checked) => onNotifyEmailChange(!!checked)}
                />
                <Mail className="h-3.5 w-3.5" />
                <span>Email</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                <Checkbox 
                  checked={notifySms} 
                  onCheckedChange={(checked) => onNotifySmsChange(!!checked)}
                  disabled
                />
                <Phone className="h-3.5 w-3.5" />
                <span>SMS</span>
                <Settings2 className="h-3 w-3" />
              </label>
            </div>
          </div>

          {/* Reminders column */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recordatorios</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={reminderWhatsapp} 
                  onCheckedChange={(checked) => onReminderWhatsappChange(!!checked)}
                />
                <MessageSquare className="h-3.5 w-3.5 text-green-600" />
                <span>WhatsApp</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={reminderEmail} 
                  onCheckedChange={(checked) => onReminderEmailChange(!!checked)}
                />
                <Mail className="h-3.5 w-3.5" />
                <span>Email</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                <Checkbox 
                  checked={reminderSms} 
                  onCheckedChange={(checked) => onReminderSmsChange(!!checked)}
                  disabled
                />
                <Phone className="h-3.5 w-3.5" />
                <span>SMS</span>
                <Settings2 className="h-3 w-3" />
              </label>
            </div>
          </div>
        </div>

        {onRequestConfirmationChange && (
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2 border-t">
            <Checkbox 
              checked={requestConfirmation} 
              onCheckedChange={(checked) => onRequestConfirmationChange(!!checked)}
            />
            <span>Pedir confirmación de asistencia</span>
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Comunicaciones</span>
        <Badge variant={statusInfo.variant} className="text-xs flex items-center gap-1">
          {isAutomatic ? <Zap className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
          {methodLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notifications Section */}
        <div className="space-y-3 p-4 rounded-lg border bg-card">
          <div>
            <h4 className="font-medium text-sm">Notificaciones</h4>
            <p className="text-xs text-muted-foreground">Se envían al crear la sesión</p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox 
                checked={notifyWhatsapp} 
                onCheckedChange={(checked) => onNotifyWhatsappChange(!!checked)}
              />
              <MessageSquare className="h-4 w-4 text-green-600" />
              <div className="flex-1">
                <span className="text-sm">Notificar por WhatsApp</span>
                <p className="text-xs text-muted-foreground">Se envía al paciente principal</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox 
                checked={notifyEmail} 
                onCheckedChange={(checked) => onNotifyEmailChange(!!checked)}
              />
              <Mail className="h-4 w-4" />
              <div className="flex-1">
                <span className="text-sm">Notificar por Email</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-muted-foreground">
              <Checkbox 
                checked={notifySms} 
                onCheckedChange={(checked) => onNotifySmsChange(!!checked)}
                disabled
              />
              <Phone className="h-4 w-4" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm">Configurar SMS</span>
                <Settings2 className="h-3.5 w-3.5" />
              </div>
            </label>
          </div>

          {onRequestConfirmationChange && (
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-3 border-t">
              <Checkbox 
                checked={requestConfirmation} 
                onCheckedChange={(checked) => onRequestConfirmationChange(!!checked)}
              />
              <span>Pedir confirmación de asistencia</span>
            </label>
          )}
        </div>

        {/* Reminders Section */}
        <div className="space-y-3 p-4 rounded-lg border bg-card">
          <div>
            <h4 className="font-medium text-sm">Recordatorios</h4>
            <p className="text-xs text-muted-foreground">Se envían 1 día antes</p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox 
                checked={reminderWhatsapp} 
                onCheckedChange={(checked) => onReminderWhatsappChange(!!checked)}
              />
              <MessageSquare className="h-4 w-4 text-green-600" />
              <div className="flex-1">
                <span className="text-sm">Recordatorio por WhatsApp</span>
                <p className="text-xs text-muted-foreground">Se envía al paciente principal</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox 
                checked={reminderEmail} 
                onCheckedChange={(checked) => onReminderEmailChange(!!checked)}
              />
              <Mail className="h-4 w-4" />
              <div className="flex-1">
                <span className="text-sm">Recordatorio por Email</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-muted-foreground">
              <Checkbox 
                checked={reminderSms} 
                onCheckedChange={(checked) => onReminderSmsChange(!!checked)}
                disabled
              />
              <Phone className="h-4 w-4" />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm">Configurar SMS</span>
                <Settings2 className="h-3.5 w-3.5" />
              </div>
            </label>
          </div>

          {onRequestConfirmationChange && (
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-3 border-t">
              <Checkbox 
                checked={requestConfirmation} 
                onCheckedChange={(checked) => onRequestConfirmationChange(!!checked)}
              />
              <span>Pedir confirmación de asistencia</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

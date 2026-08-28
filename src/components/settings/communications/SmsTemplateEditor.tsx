import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

import { TemplateVariableBadges } from './TemplateVariableBadges';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  TemplateType 
} from '@/hooks/useCommunicationTemplates';
import { Icon } from '@/components/ui/icon';

const SMS_MAX_LENGTH = 160;

export function SmsTemplateEditor() {
  const [activeTab, setActiveTab] = useState<TemplateType>('notification');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: notificationTemplate, isLoading: loadingNotification } = useCommunicationTemplate('sms', 'notification');
  const { data: reminderTemplate, isLoading: loadingReminder } = useCommunicationTemplate('sms', 'reminder');
  const upsertMutation = useUpsertCommunicationTemplate();

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.sms.notification;
    setNotificationMessage(notificationTemplate?.sms_message ?? defaults.sms_message ?? '');
  }, [notificationTemplate]);

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.sms.reminder;
    setReminderMessage(reminderTemplate?.sms_message ?? defaults.sms_message ?? '');
  }, [reminderTemplate]);

  const currentMessage = activeTab === 'notification' ? notificationMessage : reminderMessage;
  const setCurrentMessage = activeTab === 'notification' ? setNotificationMessage : setReminderMessage;

  const charCount = currentMessage.length;
  const smsCount = Math.ceil(charCount / SMS_MAX_LENGTH) || 1;
  const charProgress = Math.min((charCount / SMS_MAX_LENGTH) * 100, 100);

  const handleVariableClick = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = currentMessage.slice(0, start) + variable + currentMessage.slice(end);
    
    setCurrentMessage(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleSave = () => {
    upsertMutation.mutate({
      channel: 'sms',
      template_type: activeTab,
      sms_message: currentMessage,
    });
  };

  const handleResetToDefault = () => {
    const defaults = DEFAULT_TEMPLATES.sms[activeTab];
    setCurrentMessage(defaults.sms_message ?? '');
  };

  const highlightVariables = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{[^}]+\})/g);
    return parts.map((part, i) => {
      if (part.match(/^\{[^}]+\}$/)) {
        return (
          <span key={i} className="bg-primary/20 text-primary font-medium px-0.5 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const isLoading = loadingNotification || loadingReminder;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="smartphone" className="h-5 w-5 text-blue-600" />
          <CardTitle>Plantillas de SMS</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes SMS que se enviarán a tus pacientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Icon name="info" className="h-4 w-4" />
          <AlertDescription>
            Un SMS estándar tiene 160 caracteres. Mensajes más largos se enviarán como múltiples SMS.
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="notification">Notificación</TabsTrigger>
            <TabsTrigger value="reminder">Recordatorio</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-6 mt-6">
            <TemplateVariableBadges onVariableClick={handleVariableClick} />

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Editor Column */}
              <div className="space-y-3">
                <Label htmlFor="sms_message">Mensaje</Label>
                <Textarea
                  id="sms_message"
                  ref={textareaRef}
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder="Escribe el mensaje SMS..."
                  rows={6}
                  className={charCount > SMS_MAX_LENGTH * 2 ? 'border-amber-500' : ''}
                />
                
                {/* Character counter */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{charCount} / {SMS_MAX_LENGTH} caracteres</span>
                    <span>{smsCount} SMS{smsCount > 1 ? 's' : ''}</span>
                  </div>
                  <Progress 
                    value={charProgress} 
                    className={`h-2 ${charCount > SMS_MAX_LENGTH ? 'bg-amber-100' : ''}`}
                  />
                  {charCount > SMS_MAX_LENGTH && (
                    <p className="text-xs text-amber-600">
                      El mensaje se enviará como {smsCount} SMS concatenados
                    </p>
                  )}
                </div>
              </div>

              {/* Preview Column - Phone Style */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-2xl bg-muted border-4 border-muted p-2 max-w-[280px] mx-auto">
                  {/* Phone header */}
                  <div className="bg-background rounded-t-xl p-2 text-center border-b">
                    <p className="text-xs text-muted-foreground">SMS</p>
                    <p className="text-sm font-medium">Tu Centro</p>
                  </div>
                  
                  {/* Message area */}
                  <div className="bg-background min-h-[180px] p-3">
                    {/* SMS bubble */}
                    <div className="bg-muted rounded-2xl rounded-tl-sm p-3 max-w-[90%]">
                      <p className="text-sm whitespace-pre-wrap">
                        {highlightVariables(currentMessage) || (
                          <span className="text-muted-foreground italic">Tu mensaje aparecerá aquí...</span>
                        )}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-1">Ahora</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleResetToDefault}>
                <Icon name="restart_alt" className="mr-2 h-4 w-4" />
                Usar texto por defecto
              </Button>
              <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? (
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icon name="save" className="mr-2 h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

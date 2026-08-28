import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { TemplateVariableBadges } from './TemplateVariableBadges';
import { useCenter } from '@/hooks/useCenter';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  TemplateType 
} from '@/hooks/useCommunicationTemplates';
import { Icon } from '@/components/ui/icon';

export function WhatsAppTemplateEditor() {
  const [activeTab, setActiveTab] = useState<TemplateType>('notification');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { center } = useCenter();
  const whatsappMethod = center?.whatsapp_send_method || 'web';

  const { data: notificationTemplate, isLoading: loadingNotification } = useCommunicationTemplate('whatsapp', 'notification');
  const { data: reminderTemplate, isLoading: loadingReminder } = useCommunicationTemplate('whatsapp', 'reminder');
  const upsertMutation = useUpsertCommunicationTemplate();

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.whatsapp.notification;
    setNotificationMessage(notificationTemplate?.whatsapp_message ?? defaults.whatsapp_message ?? '');
  }, [notificationTemplate]);

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.whatsapp.reminder;
    setReminderMessage(reminderTemplate?.whatsapp_message ?? defaults.whatsapp_message ?? '');
  }, [reminderTemplate]);

  const currentMessage = activeTab === 'notification' ? notificationMessage : reminderMessage;
  const setCurrentMessage = activeTab === 'notification' ? setNotificationMessage : setReminderMessage;

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
      channel: 'whatsapp',
      template_type: activeTab,
      whatsapp_message: currentMessage,
    });
  };

  const handleResetToDefault = () => {
    const defaults = DEFAULT_TEMPLATES.whatsapp[activeTab];
    setCurrentMessage(defaults.whatsapp_message ?? '');
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="chat" className="h-5 w-5 text-green-600" />
            <CardTitle>Plantillas de WhatsApp</CardTitle>
          </div>
          {whatsappMethod === 'web' ? (
            <Badge variant="secondary" className="gap-1">
              <Icon name="public" className="h-3 w-3" />
              WhatsApp Web
            </Badge>
          ) : (
            <Badge variant="default" className="gap-1 bg-blue-600">
              <Icon name="bolt" className="h-3 w-3" />
              API Meta
            </Badge>
          )}
        </div>
        <CardDescription>
          Configura los mensajes de WhatsApp que se enviarán a tus pacientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Icon name="info" className="h-4 w-4" />
          <AlertDescription>
            Los mensajes de WhatsApp tienen formato de texto plano. Las variables se reemplazarán automáticamente al enviar.
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="notification">Notificación</TabsTrigger>
            <TabsTrigger value="reminder">Recordatorio</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-6 mt-6">
            <TemplateVariableBadges onVariableClick={handleVariableClick} showAll />

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Editor Column */}
              <div className="space-y-2">
                <Label htmlFor="whatsapp_message">Mensaje</Label>
                <Textarea
                  id="whatsapp_message"
                  ref={textareaRef}
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder="Escribe el mensaje de WhatsApp..."
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  {currentMessage.length} caracteres
                </p>
              </div>

              {/* Preview Column - WhatsApp Style */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-lg bg-[#e5ddd5] dark:bg-[#0b141a] p-4 min-h-[200px]">
                  {/* WhatsApp bubble */}
                  <div className="max-w-[85%] ml-auto">
                    <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg p-3 shadow-sm relative">
                      {/* Bubble tail */}
                      <div className="absolute -right-2 top-0 w-0 h-0 border-l-8 border-l-[#dcf8c6] dark:border-l-[#005c4b] border-t-8 border-t-transparent border-b-8 border-b-transparent" />
                      
                      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                        {highlightVariables(currentMessage) || (
                          <span className="text-muted-foreground italic">Tu mensaje aparecerá aquí...</span>
                        )}
                      </p>
                      
                      <div className="flex justify-end items-center gap-1 mt-1">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">12:00</span>
                        <svg className="w-4 h-4 text-blue-500" viewBox="0 0 16 15" fill="currentColor">
                          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
                        </svg>
                      </div>
                    </div>
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

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { TemplateVariableBadges } from './TemplateVariableBadges';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  TemplateType,
} from '@/hooks/useCommunicationTemplates';
import { Icon } from '@/components/ui/icon';

export function EmailTemplateEditor() {
  const [activeTab, setActiveTab] = useState<TemplateType>('notification');
  const [activeField, setActiveField] = useState<string | null>(null);
  
  // Form state for notification
  const [notificationForm, setNotificationForm] = useState({
    email_subject: '',
    email_initial_text: '',
    email_confirmation_text: '',
    email_videocall_text: '',
    email_payment_text: '',
    email_footer: '',
  });
  
  // Form state for reminder
  const [reminderForm, setReminderForm] = useState({
    email_subject: '',
    email_initial_text: '',
    email_confirmation_text: '',
    email_videocall_text: '',
    email_payment_text: '',
    email_footer: '',
  });

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  const { data: notificationTemplate, isLoading: loadingNotification } = useCommunicationTemplate('email', 'notification');
  const { data: reminderTemplate, isLoading: loadingReminder } = useCommunicationTemplate('email', 'reminder');
  const upsertMutation = useUpsertCommunicationTemplate();

  // Initialize forms with data or defaults
  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.email.notification;
    setNotificationForm({
      email_subject: notificationTemplate?.email_subject ?? defaults.email_subject ?? '',
      email_initial_text: notificationTemplate?.email_initial_text ?? defaults.email_initial_text ?? '',
      email_confirmation_text: notificationTemplate?.email_confirmation_text ?? defaults.email_confirmation_text ?? '',
      email_videocall_text: notificationTemplate?.email_videocall_text ?? defaults.email_videocall_text ?? '',
      email_payment_text: notificationTemplate?.email_payment_text ?? defaults.email_payment_text ?? '',
      email_footer: notificationTemplate?.email_footer ?? defaults.email_footer ?? '',
    });
  }, [notificationTemplate]);

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.email.reminder;
    setReminderForm({
      email_subject: reminderTemplate?.email_subject ?? defaults.email_subject ?? '',
      email_initial_text: reminderTemplate?.email_initial_text ?? defaults.email_initial_text ?? '',
      email_confirmation_text: reminderTemplate?.email_confirmation_text ?? defaults.email_confirmation_text ?? '',
      email_videocall_text: reminderTemplate?.email_videocall_text ?? defaults.email_videocall_text ?? '',
      email_payment_text: reminderTemplate?.email_payment_text ?? defaults.email_payment_text ?? '',
      email_footer: reminderTemplate?.email_footer ?? defaults.email_footer ?? '',
    });
  }, [reminderTemplate]);

  const currentForm = activeTab === 'notification' ? notificationForm : reminderForm;
  const setCurrentForm = activeTab === 'notification' ? setNotificationForm : setReminderForm;

  const handleFieldChange = (field: string, value: string) => {
    setCurrentForm(prev => ({ ...prev, [field]: value }));
  };

  const handleVariableClick = (variable: string) => {
    if (!activeField) return;
    
    const element = textareaRefs.current[activeField];
    if (!element) return;

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const currentValue = currentForm[activeField as keyof typeof currentForm] || '';
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);
    
    handleFieldChange(activeField, newValue);
    
    // Restore cursor position after variable
    setTimeout(() => {
      element.focus();
      const newPosition = start + variable.length;
      element.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleSave = () => {
    upsertMutation.mutate({
      channel: 'email',
      template_type: activeTab,
      ...currentForm,
    });
  };

  const handleResetToDefault = () => {
    const defaults = DEFAULT_TEMPLATES.email[activeTab];
    setCurrentForm({
      email_subject: defaults.email_subject ?? '',
      email_initial_text: defaults.email_initial_text ?? '',
      email_confirmation_text: defaults.email_confirmation_text ?? '',
      email_videocall_text: defaults.email_videocall_text ?? '',
      email_payment_text: defaults.email_payment_text ?? '',
      email_footer: defaults.email_footer ?? '',
    });
  };

  // Highlight variables in preview
  const highlightVariables = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{[^}]+\})/g);
    return parts.map((part, i) => {
      if (part.match(/^\{[^}]+\}$/)) {
        return (
          <span key={i} className="bg-primary/20 text-primary font-medium px-1 rounded">
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
          <Icon name="mail" className="h-5 w-5 text-primary" />
          <CardTitle>Plantillas de Email</CardTitle>
        </div>
        <CardDescription>
          Configura las plantillas de email que se enviarán a tus pacientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Icon name="info" className="h-4 w-4" />
          <AlertDescription>
            Las variables entre llaves se reemplazarán automáticamente con los datos correspondientes al enviar el mensaje.
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email_subject">Asunto del email</Label>
                  <Input
                    id="email_subject"
                    ref={(el) => { textareaRefs.current['email_subject'] = el; }}
                    value={currentForm.email_subject}
                    onChange={(e) => handleFieldChange('email_subject', e.target.value)}
                    onFocus={() => setActiveField('email_subject')}
                    placeholder="Asunto del email..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_initial_text">Texto inicial</Label>
                  <Textarea
                    id="email_initial_text"
                    ref={(el) => { textareaRefs.current['email_initial_text'] = el; }}
                    value={currentForm.email_initial_text}
                    onChange={(e) => handleFieldChange('email_initial_text', e.target.value)}
                    onFocus={() => setActiveField('email_initial_text')}
                    placeholder="Escribe el texto inicial del email..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_confirmation_text">Si se solicita confirmación</Label>
                  <Textarea
                    id="email_confirmation_text"
                    ref={(el) => { textareaRefs.current['email_confirmation_text'] = el; }}
                    value={currentForm.email_confirmation_text}
                    onChange={(e) => handleFieldChange('email_confirmation_text', e.target.value)}
                    onFocus={() => setActiveField('email_confirmation_text')}
                    placeholder="Texto para cuando se solicita confirmación..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_videocall_text">Si hay videollamada</Label>
                  <Textarea
                    id="email_videocall_text"
                    ref={(el) => { textareaRefs.current['email_videocall_text'] = el; }}
                    value={currentForm.email_videocall_text}
                    onChange={(e) => handleFieldChange('email_videocall_text', e.target.value)}
                    onFocus={() => setActiveField('email_videocall_text')}
                    placeholder="Texto para sesiones con videollamada..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_payment_text">Si hay pago pendiente</Label>
                  <Textarea
                    id="email_payment_text"
                    ref={(el) => { textareaRefs.current['email_payment_text'] = el; }}
                    value={currentForm.email_payment_text}
                    onChange={(e) => handleFieldChange('email_payment_text', e.target.value)}
                    onFocus={() => setActiveField('email_payment_text')}
                    placeholder="Texto para cuando hay pago pendiente..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_footer">Pie del email (avisos legales)</Label>
                  <Textarea
                    id="email_footer"
                    ref={(el) => { textareaRefs.current['email_footer'] = el; }}
                    value={currentForm.email_footer}
                    onChange={(e) => handleFieldChange('email_footer', e.target.value)}
                    onFocus={() => setActiveField('email_footer')}
                    placeholder="Texto del pie de email, avisos legales, política de privacidad..."
                    rows={4}
                  />
                </div>
              </div>

              {/* Preview Column */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-lg border bg-card p-4 space-y-3 min-h-[300px]">
                  <div className="border-b pb-2 mb-3">
                    <p className="text-xs text-muted-foreground">De: tu-centro@psycma.com</p>
                    <p className="text-xs text-muted-foreground">Para: paciente@email.com</p>
                    <p className="text-sm font-medium mt-1">
                      {currentForm.email_subject ? highlightVariables(currentForm.email_subject) : (
                        <span className="text-muted-foreground italic">Sin asunto</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    {currentForm.email_initial_text && (
                      <p className="whitespace-pre-wrap">{highlightVariables(currentForm.email_initial_text)}</p>
                    )}
                    {currentForm.email_confirmation_text && (
                      <p className="text-muted-foreground italic whitespace-pre-wrap">
                        {highlightVariables(currentForm.email_confirmation_text)}
                      </p>
                    )}
                    {currentForm.email_videocall_text && (
                      <p className="text-muted-foreground italic whitespace-pre-wrap">
                        {highlightVariables(currentForm.email_videocall_text)}
                      </p>
                    )}
                    {currentForm.email_payment_text && (
                      <p className="text-muted-foreground italic whitespace-pre-wrap">
                        {highlightVariables(currentForm.email_payment_text)}
                      </p>
                    )}
                  </div>

                  {currentForm.email_footer && (
                    <div className="border-t pt-3 mt-4">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {highlightVariables(currentForm.email_footer)}
                      </p>
                    </div>
                  )}
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
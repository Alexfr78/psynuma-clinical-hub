import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, RotateCcw, Info, Mail } from 'lucide-react';
import { TemplateVariableBadges } from './TemplateVariableBadges';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  TemplateType,
  TEMPLATE_VARIABLES
} from '@/hooks/useCommunicationTemplates';

export function EmailTemplateEditor() {
  const [activeTab, setActiveTab] = useState<TemplateType>('notification');
  const [activeField, setActiveField] = useState<string | null>(null);
  
  // Form state for notification
  const [notificationForm, setNotificationForm] = useState({
    email_initial_text: '',
    email_confirmation_text: '',
    email_videocall_text: '',
    email_payment_text: '',
  });
  
  // Form state for reminder
  const [reminderForm, setReminderForm] = useState({
    email_initial_text: '',
    email_confirmation_text: '',
    email_videocall_text: '',
    email_payment_text: '',
  });

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: notificationTemplate, isLoading: loadingNotification } = useCommunicationTemplate('email', 'notification');
  const { data: reminderTemplate, isLoading: loadingReminder } = useCommunicationTemplate('email', 'reminder');
  const upsertMutation = useUpsertCommunicationTemplate();

  // Initialize forms with data or defaults
  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.email.notification;
    setNotificationForm({
      email_initial_text: notificationTemplate?.email_initial_text ?? defaults.email_initial_text ?? '',
      email_confirmation_text: notificationTemplate?.email_confirmation_text ?? defaults.email_confirmation_text ?? '',
      email_videocall_text: notificationTemplate?.email_videocall_text ?? defaults.email_videocall_text ?? '',
      email_payment_text: notificationTemplate?.email_payment_text ?? defaults.email_payment_text ?? '',
    });
  }, [notificationTemplate]);

  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.email.reminder;
    setReminderForm({
      email_initial_text: reminderTemplate?.email_initial_text ?? defaults.email_initial_text ?? '',
      email_confirmation_text: reminderTemplate?.email_confirmation_text ?? defaults.email_confirmation_text ?? '',
      email_videocall_text: reminderTemplate?.email_videocall_text ?? defaults.email_videocall_text ?? '',
      email_payment_text: reminderTemplate?.email_payment_text ?? defaults.email_payment_text ?? '',
    });
  }, [reminderTemplate]);

  const currentForm = activeTab === 'notification' ? notificationForm : reminderForm;
  const setCurrentForm = activeTab === 'notification' ? setNotificationForm : setReminderForm;

  const handleFieldChange = (field: string, value: string) => {
    setCurrentForm(prev => ({ ...prev, [field]: value }));
  };

  const handleVariableClick = (variable: string) => {
    if (!activeField) return;
    
    const textarea = textareaRefs.current[activeField];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = currentForm[activeField as keyof typeof currentForm] || '';
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);
    
    handleFieldChange(activeField, newValue);
    
    // Restore cursor position after variable
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length;
      textarea.setSelectionRange(newPosition, newPosition);
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
      email_initial_text: defaults.email_initial_text ?? '',
      email_confirmation_text: defaults.email_confirmation_text ?? '',
      email_videocall_text: defaults.email_videocall_text ?? '',
      email_payment_text: defaults.email_payment_text ?? '',
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Plantillas de Email</CardTitle>
        </div>
        <CardDescription>
          Configura las plantillas de email que se enviarán a tus pacientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
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
                  <Label htmlFor="email_initial_text">Texto inicial</Label>
                  <Textarea
                    id="email_initial_text"
                    ref={(el) => (textareaRefs.current['email_initial_text'] = el)}
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
                    ref={(el) => (textareaRefs.current['email_confirmation_text'] = el)}
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
                    ref={(el) => (textareaRefs.current['email_videocall_text'] = el)}
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
                    ref={(el) => (textareaRefs.current['email_payment_text'] = el)}
                    value={currentForm.email_payment_text}
                    onChange={(e) => handleFieldChange('email_payment_text', e.target.value)}
                    onFocus={() => setActiveField('email_payment_text')}
                    placeholder="Texto para cuando hay pago pendiente..."
                    rows={2}
                  />
                </div>
              </div>

              {/* Preview Column */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-lg border bg-card p-4 space-y-3 min-h-[300px]">
                  <div className="border-b pb-2 mb-3">
                    <p className="text-xs text-muted-foreground">De: tu-centro@psynuma.com</p>
                    <p className="text-xs text-muted-foreground">Para: paciente@email.com</p>
                    <p className="text-sm font-medium mt-1">
                      {activeTab === 'notification' ? 'Nueva sesión programada' : 'Recordatorio de tu sesión'}
                    </p>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    {currentForm.email_initial_text && (
                      <p>{highlightVariables(currentForm.email_initial_text)}</p>
                    )}
                    {currentForm.email_confirmation_text && (
                      <p className="text-muted-foreground italic">
                        {highlightVariables(currentForm.email_confirmation_text)}
                      </p>
                    )}
                    {currentForm.email_videocall_text && (
                      <p className="text-muted-foreground italic">
                        {highlightVariables(currentForm.email_videocall_text)}
                      </p>
                    )}
                    {currentForm.email_payment_text && (
                      <p className="text-muted-foreground italic">
                        {highlightVariables(currentForm.email_payment_text)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleResetToDefault}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Usar texto por defecto
              </Button>
              <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
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

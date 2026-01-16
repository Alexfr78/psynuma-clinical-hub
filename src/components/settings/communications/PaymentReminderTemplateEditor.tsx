import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, RotateCcw, Info, Wallet, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useCenter } from '@/hooks/useCenter';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  PAYMENT_REMINDER_VARIABLES,
  TemplateChannel
} from '@/hooks/useCommunicationTemplates';

export function PaymentReminderTemplateEditor() {
  const [activeTab, setActiveTab] = useState<TemplateChannel>('whatsapp');
  
  // Email fields
  const [emailSubject, setEmailSubject] = useState('');
  const [emailInitialText, setEmailInitialText] = useState('');
  const [emailPaymentText, setEmailPaymentText] = useState('');
  const [emailFooter, setEmailFooter] = useState('');
  
  // WhatsApp field
  const [whatsappMessage, setWhatsappMessage] = useState('');
  
  // SMS field
  const [smsMessage, setSmsMessage] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { center } = useCenter();

  const { data: emailTemplate, isLoading: loadingEmail } = useCommunicationTemplate('email', 'payment_reminder');
  const { data: whatsappTemplate, isLoading: loadingWhatsApp } = useCommunicationTemplate('whatsapp', 'payment_reminder');
  const { data: smsTemplate, isLoading: loadingSms } = useCommunicationTemplate('sms', 'payment_reminder');
  const upsertMutation = useUpsertCommunicationTemplate();

  // Load email template
  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.email.payment_reminder;
    setEmailSubject(emailTemplate?.email_subject ?? defaults.email_subject ?? '');
    setEmailInitialText(emailTemplate?.email_initial_text ?? defaults.email_initial_text ?? '');
    setEmailPaymentText(emailTemplate?.email_payment_text ?? defaults.email_payment_text ?? '');
    setEmailFooter(emailTemplate?.email_footer ?? defaults.email_footer ?? '');
  }, [emailTemplate]);

  // Load WhatsApp template
  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.whatsapp.payment_reminder;
    setWhatsappMessage(whatsappTemplate?.whatsapp_message ?? defaults.whatsapp_message ?? '');
  }, [whatsappTemplate]);

  // Load SMS template
  useEffect(() => {
    const defaults = DEFAULT_TEMPLATES.sms.payment_reminder;
    setSmsMessage(smsTemplate?.sms_message ?? defaults.sms_message ?? '');
  }, [smsTemplate]);

  const handleVariableClick = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    let currentValue = '';
    let setValue: (v: string) => void;
    
    if (activeTab === 'whatsapp') {
      currentValue = whatsappMessage;
      setValue = setWhatsappMessage;
    } else if (activeTab === 'sms') {
      currentValue = smsMessage;
      setValue = setSmsMessage;
    } else {
      // For email, default to payment text
      currentValue = emailPaymentText;
      setValue = setEmailPaymentText;
    }
    
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);
    setValue(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleSave = () => {
    if (activeTab === 'email') {
      upsertMutation.mutate({
        channel: 'email',
        template_type: 'payment_reminder',
        email_subject: emailSubject,
        email_initial_text: emailInitialText,
        email_payment_text: emailPaymentText,
        email_footer: emailFooter,
      });
    } else if (activeTab === 'whatsapp') {
      upsertMutation.mutate({
        channel: 'whatsapp',
        template_type: 'payment_reminder',
        whatsapp_message: whatsappMessage,
      });
    } else {
      upsertMutation.mutate({
        channel: 'sms',
        template_type: 'payment_reminder',
        sms_message: smsMessage,
      });
    }
  };

  const handleResetToDefault = () => {
    const defaults = DEFAULT_TEMPLATES[activeTab].payment_reminder;
    if (activeTab === 'email') {
      setEmailSubject(defaults.email_subject ?? '');
      setEmailInitialText(defaults.email_initial_text ?? '');
      setEmailPaymentText(defaults.email_payment_text ?? '');
      setEmailFooter(defaults.email_footer ?? '');
    } else if (activeTab === 'whatsapp') {
      setWhatsappMessage(defaults.whatsapp_message ?? '');
    } else {
      setSmsMessage(defaults.sms_message ?? '');
    }
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

  const isLoading = loadingEmail || loadingWhatsApp || loadingSms;

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
          <Wallet className="h-5 w-5 text-primary" />
          <CardTitle>Plantillas de Recordatorio de Pago</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes que se enviarán a los pacientes como recordatorio de pagos pendientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Estas plantillas se usan al enviar recordatorios de pago desde la sección de Cobros y Deudas.
            Al enviar, puedes elegir qué opciones de pago incluir (Stripe, Bizum, Bono) y el mensaje se adaptará automáticamente.
          </AlertDescription>
        </Alert>

        {/* Variables badges */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Variables disponibles</Label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_REMINDER_VARIABLES.filter(v => 
              // Show general variables always
              !['{link_pago_stripe}', '{bizum_numero}', '{link_comprar_bono}'].includes(v.key)
            ).map((variable) => (
              <Badge
                key={variable.key}
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => handleVariableClick(variable.key)}
              >
                {variable.key}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Variables de opciones de pago</strong> (se incluyen/excluyen según las opciones seleccionadas al enviar):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_REMINDER_VARIABLES.filter(v => 
              ['{link_pago_stripe}', '{bizum_numero}', '{link_comprar_bono}'].includes(v.key)
            ).map((variable) => (
              <Badge
                key={variable.key}
                variant="outline"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => handleVariableClick(variable.key)}
              >
                {variable.key}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Haz clic en una variable para insertarla en el editor
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="whatsapp">
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="h-4 w-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="sms">
              <Smartphone className="h-4 w-4 mr-2" />
              SMS
            </TabsTrigger>
          </TabsList>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="space-y-4 mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp_message">Mensaje</Label>
                <Textarea
                  id="whatsapp_message"
                  ref={textareaRef}
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  placeholder="Escribe el mensaje de WhatsApp..."
                  rows={10}
                />
                <p className="text-xs text-muted-foreground">
                  {whatsappMessage.length} caracteres
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-lg bg-[#e5ddd5] dark:bg-[#0b141a] p-4 min-h-[250px]">
                  <div className="max-w-[85%] ml-auto">
                    <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg p-3 shadow-sm relative">
                      <div className="absolute -right-2 top-0 w-0 h-0 border-l-8 border-l-[#dcf8c6] dark:border-l-[#005c4b] border-t-8 border-t-transparent border-b-8 border-b-transparent" />
                      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                        {highlightVariables(whatsappMessage) || (
                          <span className="text-muted-foreground italic">Tu mensaje aparecerá aquí...</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email_subject">Asunto</Label>
                <Input
                  id="email_subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Asunto del email..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email_initial">Texto inicial</Label>
                <Textarea
                  id="email_initial"
                  value={emailInitialText}
                  onChange={(e) => setEmailInitialText(e.target.value)}
                  placeholder="Saludo y contexto del recordatorio..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email_payment">Texto de opciones de pago</Label>
                <Textarea
                  id="email_payment"
                  ref={textareaRef}
                  value={emailPaymentText}
                  onChange={(e) => setEmailPaymentText(e.target.value)}
                  placeholder="Información sobre cómo realizar el pago..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email_footer">Pie de mensaje</Label>
                <Textarea
                  id="email_footer"
                  value={emailFooter}
                  onChange={(e) => setEmailFooter(e.target.value)}
                  placeholder="Despedida..."
                  rows={2}
                />
              </div>
            </div>
          </TabsContent>

          {/* SMS Tab */}
          <TabsContent value="sms" className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="sms_message">Mensaje SMS</Label>
              <Textarea
                id="sms_message"
                ref={textareaRef}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                placeholder="Escribe el mensaje SMS..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {smsMessage.length} caracteres (160 por SMS)
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
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
      </CardContent>
    </Card>
  );
}

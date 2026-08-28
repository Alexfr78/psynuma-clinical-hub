import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { useCenter } from '@/hooks/useCenter';
import { 
  useCommunicationTemplate, 
  useUpsertCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  PAYMENT_REMINDER_VARIABLES,
  TemplateChannel
} from '@/hooks/useCommunicationTemplates';
import { Icon } from '@/components/ui/icon';

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

  // Payment option fields - per channel
  const [paymentOptionStripe, setPaymentOptionStripe] = useState('');
  const [paymentOptionBizum, setPaymentOptionBizum] = useState('');
  const [paymentOptionBono, setPaymentOptionBono] = useState('');
  const [paymentOptionTransfer, setPaymentOptionTransfer] = useState('');
  
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

  // Load payment options based on active tab
  useEffect(() => {
    const template = activeTab === 'email' ? emailTemplate : activeTab === 'whatsapp' ? whatsappTemplate : smsTemplate;
    const defaults = DEFAULT_TEMPLATES[activeTab].payment_reminder;
    
    setPaymentOptionStripe(template?.payment_option_stripe ?? defaults.payment_option_stripe ?? '');
    setPaymentOptionBizum(template?.payment_option_bizum ?? defaults.payment_option_bizum ?? '');
    setPaymentOptionBono(template?.payment_option_bono ?? defaults.payment_option_bono ?? '');
    setPaymentOptionTransfer(template?.payment_option_transfer ?? defaults.payment_option_transfer ?? '');
  }, [activeTab, emailTemplate, whatsappTemplate, smsTemplate]);

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
      // For email, default to initial text
      currentValue = emailInitialText;
      setValue = setEmailInitialText;
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
        payment_option_stripe: paymentOptionStripe,
        payment_option_bizum: paymentOptionBizum,
        payment_option_bono: paymentOptionBono,
        payment_option_transfer: paymentOptionTransfer,
      });
    } else if (activeTab === 'whatsapp') {
      upsertMutation.mutate({
        channel: 'whatsapp',
        template_type: 'payment_reminder',
        whatsapp_message: whatsappMessage,
        payment_option_stripe: paymentOptionStripe,
        payment_option_bizum: paymentOptionBizum,
        payment_option_bono: paymentOptionBono,
        payment_option_transfer: paymentOptionTransfer,
      });
    } else {
      upsertMutation.mutate({
        channel: 'sms',
        template_type: 'payment_reminder',
        sms_message: smsMessage,
        payment_option_stripe: paymentOptionStripe,
        payment_option_bizum: paymentOptionBizum,
        payment_option_bono: paymentOptionBono,
        payment_option_transfer: paymentOptionTransfer,
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
    // Reset payment options for current tab
    setPaymentOptionStripe(defaults.payment_option_stripe ?? '');
    setPaymentOptionBizum(defaults.payment_option_bizum ?? '');
    setPaymentOptionBono(defaults.payment_option_bono ?? '');
    setPaymentOptionTransfer(defaults.payment_option_transfer ?? '');
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
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Separate general variables from payment-specific ones
  const generalVariables = PAYMENT_REMINDER_VARIABLES.filter(v => 
    !['{link_pago_stripe}', '{bizum_numero}', '{link_comprar_bono}', '{datos_transferencia}'].includes(v.key)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon name="account_balance_wallet" className="h-5 w-5 text-primary" />
          <CardTitle>Plantillas de Recordatorio de Pago</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes que se enviarán a los pacientes como recordatorio de pagos pendientes.
          Cada opción de pago tiene su propio texto editable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Icon name="info" className="h-4 w-4" />
          <AlertDescription>
            El mensaje base se enviará siempre. Los textos de las opciones de pago (Stripe, Bizum, Bono) 
            se añadirán automáticamente según lo que selecciones al enviar el recordatorio.
          </AlertDescription>
        </Alert>

        {/* Variables badges - only general ones */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Variables disponibles para el mensaje base</Label>
          <div className="flex flex-wrap gap-1.5">
            {generalVariables.map((variable) => (
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
          <p className="text-xs text-muted-foreground">
            Haz clic en una variable para insertarla en el editor
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="whatsapp">
              <Icon name="chat" className="h-4 w-4 mr-2" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email">
              <Icon name="mail" className="h-4 w-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="sms">
              <Icon name="smartphone" className="h-4 w-4 mr-2" />
              SMS
            </TabsTrigger>
          </TabsList>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="space-y-6 mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp_message">Mensaje base</Label>
                <Textarea
                  id="whatsapp_message"
                  ref={textareaRef}
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  placeholder="Escribe el mensaje de WhatsApp..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  {whatsappMessage.length} caracteres
                </p>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Vista previa</Label>
                <div className="rounded-lg bg-[#e5ddd5] dark:bg-[#0b141a] p-4 min-h-[200px]">
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

            {/* Payment options - WhatsApp */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Icon name="credit_card" className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">Opciones de pago</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Estos textos se añadirán al mensaje cuando selecciones incluir cada opción al enviar.
              </p>
              
              <div className="grid gap-4">
                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="wa_stripe" className="flex items-center gap-2">
                    <Icon name="credit_card" className="h-4 w-4 text-blue-600" />
                    Enlace de pago (Stripe)
                  </Label>
                  <Input
                    id="wa_stripe"
                    value={paymentOptionStripe}
                    onChange={(e) => setPaymentOptionStripe(e.target.value)}
                    placeholder="💳 Pagar por tarjeta: {link_pago_stripe}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{'{link_pago_stripe}'}</code> para insertar el enlace
                  </p>
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="wa_bizum" className="flex items-center gap-2">
                    <Icon name="smartphone" className="h-4 w-4 text-green-600" />
                    Bizum
                  </Label>
                  <Input
                    id="wa_bizum"
                    value={paymentOptionBizum}
                    onChange={(e) => setPaymentOptionBizum(e.target.value)}
                    placeholder="📱 Bizum al {bizum_numero}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{'{bizum_numero}'}</code> para insertar el número
                  </p>
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="wa_transfer" className="flex items-center gap-2">
                    <Icon name="apartment" className="h-4 w-4 text-amber-600" />
                    Transferencia bancaria
                  </Label>
                  <Textarea
                    id="wa_transfer"
                    value={paymentOptionTransfer}
                    onChange={(e) => setPaymentOptionTransfer(e.target.value)}
                    placeholder="🏦 Transferencia:\n{datos_transferencia}"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{'{datos_transferencia}'}</code> para insertar tus datos bancarios (configurados más abajo)
                  </p>
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="wa_bono" className="flex items-center gap-2">
                    <Icon name="account_balance_wallet" className="h-4 w-4 text-purple-600" />
                    Bono
                  </Label>
                  <Input
                    id="wa_bono"
                    value={paymentOptionBono}
                    onChange={(e) => setPaymentOptionBono(e.target.value)}
                    placeholder="🎫 ¿Prefieres un bono? {link_comprar_bono}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{'{link_comprar_bono}'}</code> para insertar el enlace
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-6 mt-6">
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
                <Label htmlFor="email_initial">Mensaje base</Label>
                <Textarea
                  id="email_initial"
                  ref={textareaRef}
                  value={emailInitialText}
                  onChange={(e) => setEmailInitialText(e.target.value)}
                  placeholder="Saludo y contexto del recordatorio..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email_payment">Texto antes de opciones de pago</Label>
                <Input
                  id="email_payment"
                  value={emailPaymentText}
                  onChange={(e) => setEmailPaymentText(e.target.value)}
                  placeholder="Puedes realizar el pago por:"
                />
                <p className="text-xs text-muted-foreground">
                  Este texto aparece antes de listar las opciones de pago seleccionadas
                </p>
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

            {/* Payment options - Email */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Icon name="credit_card" className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">Opciones de pago</Label>
              </div>
              
              <div className="grid gap-4">
                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="email_stripe" className="flex items-center gap-2">
                    <Icon name="credit_card" className="h-4 w-4 text-blue-600" />
                    Enlace de pago (Stripe)
                  </Label>
                  <Input
                    id="email_stripe"
                    value={paymentOptionStripe}
                    onChange={(e) => setPaymentOptionStripe(e.target.value)}
                    placeholder="💳 Pagar con tarjeta: {link_pago_stripe}"
                  />
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="email_bizum" className="flex items-center gap-2">
                    <Icon name="smartphone" className="h-4 w-4 text-green-600" />
                    Bizum
                  </Label>
                  <Input
                    id="email_bizum"
                    value={paymentOptionBizum}
                    onChange={(e) => setPaymentOptionBizum(e.target.value)}
                    placeholder="📱 Bizum al número {bizum_numero}"
                  />
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="email_transfer" className="flex items-center gap-2">
                    <Icon name="apartment" className="h-4 w-4 text-amber-600" />
                    Transferencia bancaria
                  </Label>
                  <Textarea
                    id="email_transfer"
                    value={paymentOptionTransfer}
                    onChange={(e) => setPaymentOptionTransfer(e.target.value)}
                    placeholder="🏦 Transferencia bancaria:\n{datos_transferencia}"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{'{datos_transferencia}'}</code> para insertar los datos bancarios configurados más abajo
                  </p>
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="email_bono" className="flex items-center gap-2">
                    <Icon name="account_balance_wallet" className="h-4 w-4 text-purple-600" />
                    Bono
                  </Label>
                  <Input
                    id="email_bono"
                    value={paymentOptionBono}
                    onChange={(e) => setPaymentOptionBono(e.target.value)}
                    placeholder="🎫 Adquirir un bono: {link_comprar_bono}"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* SMS Tab */}
          <TabsContent value="sms" className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="sms_message">Mensaje base SMS</Label>
              <Textarea
                id="sms_message"
                ref={textareaRef}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                placeholder="Escribe el mensaje SMS..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {smsMessage.length} caracteres (160 por SMS)
              </p>
            </div>

            {/* Payment options - SMS */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Icon name="credit_card" className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">Opciones de pago</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Mantén estos textos cortos para no exceder el límite de caracteres SMS.
              </p>
              
              <div className="grid gap-4">
                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="sms_stripe" className="flex items-center gap-2">
                    <Icon name="credit_card" className="h-4 w-4 text-blue-600" />
                    Enlace de pago (Stripe)
                  </Label>
                  <Input
                    id="sms_stripe"
                    value={paymentOptionStripe}
                    onChange={(e) => setPaymentOptionStripe(e.target.value)}
                    placeholder="Pagar: {link_pago_stripe}"
                  />
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="sms_bizum" className="flex items-center gap-2">
                    <Icon name="smartphone" className="h-4 w-4 text-green-600" />
                    Bizum
                  </Label>
                  <Input
                    id="sms_bizum"
                    value={paymentOptionBizum}
                    onChange={(e) => setPaymentOptionBizum(e.target.value)}
                    placeholder="Bizum: {bizum_numero}"
                  />
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="sms_transfer" className="flex items-center gap-2">
                    <Icon name="apartment" className="h-4 w-4 text-amber-600" />
                    Transferencia bancaria
                  </Label>
                  <Input
                    id="sms_transfer"
                    value={paymentOptionTransfer}
                    onChange={(e) => setPaymentOptionTransfer(e.target.value)}
                    placeholder="Transf: {datos_transferencia}"
                  />
                </div>

                <div className="space-y-2 p-3 border rounded-lg">
                  <Label htmlFor="sms_bono" className="flex items-center gap-2">
                    <Icon name="account_balance_wallet" className="h-4 w-4 text-purple-600" />
                    Bono
                  </Label>
                  <Input
                    id="sms_bono"
                    value={paymentOptionBono}
                    onChange={(e) => setPaymentOptionBono(e.target.value)}
                    placeholder="Bono: {link_comprar_bono}"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
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
      </CardContent>
    </Card>
  );
}

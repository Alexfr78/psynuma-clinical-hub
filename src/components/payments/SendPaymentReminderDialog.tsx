import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Mail, MessageCircle, Smartphone, CreditCard, Wallet } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { 
  useCommunicationTemplate, 
  DEFAULT_TEMPLATES,
  PAYMENT_REMINDER_VARIABLES 
} from '@/hooks/useCommunicationTemplates';
import type { DebtWithRelations } from '@/hooks/useDebts';

interface SendPaymentReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: DebtWithRelations | null;
}

type Channel = 'email' | 'whatsapp' | 'sms';

export function SendPaymentReminderDialog({ 
  open, 
  onOpenChange, 
  debt 
}: SendPaymentReminderDialogProps) {
  const { center } = useCenter();
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [includeStripeLink, setIncludeStripeLink] = useState(true);
  const [includeBizum, setIncludeBizum] = useState(true);
  const [includeBonoOption, setIncludeBonoOption] = useState(false);
  const [messagePreview, setMessagePreview] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { data: emailTemplate } = useCommunicationTemplate('email', 'payment_reminder');
  const { data: whatsappTemplate } = useCommunicationTemplate('whatsapp', 'payment_reminder');
  const { data: smsTemplate } = useCommunicationTemplate('sms', 'payment_reminder');

  const pendingAmount = debt ? Number(debt.amount) - Number(debt.paid_amount) : 0;
  const patientName = debt?.patients ? `${debt.patients.first_name} ${debt.patients.last_name}` : '';
  const patientEmail = debt?.patients?.email || '';
  const patientPhone = debt?.patients?.phone || '';

  // Check if patient has required contact info
  const canSendEmail = !!patientEmail;
  const canSendWhatsApp = !!patientPhone;
  const canSendSms = !!patientPhone;

  // Build message preview based on channel and options
  useEffect(() => {
    if (!debt || !center) return;

    const defaults = DEFAULT_TEMPLATES[channel].payment_reminder;
    const currentTemplate = channel === 'email' ? emailTemplate : channel === 'whatsapp' ? whatsappTemplate : smsTemplate;
    
    // Get base message from template or defaults
    let baseMessage = '';
    if (channel === 'email') {
      baseMessage = currentTemplate?.email_initial_text ?? defaults.email_initial_text ?? '';
    } else if (channel === 'whatsapp') {
      baseMessage = currentTemplate?.whatsapp_message ?? defaults.whatsapp_message ?? '';
    } else {
      baseMessage = currentTemplate?.sms_message ?? defaults.sms_message ?? '';
    }

    // Get payment option texts from template or defaults
    const stripeOptionText = currentTemplate?.payment_option_stripe ?? defaults.payment_option_stripe ?? '';
    const bizumOptionText = currentTemplate?.payment_option_bizum ?? defaults.payment_option_bizum ?? '';
    const bonoOptionText = currentTemplate?.payment_option_bono ?? defaults.payment_option_bono ?? '';

    // Build payment options array based on selections
    const paymentLines: string[] = [];
    
    if (includeStripeLink && stripeOptionText) {
      paymentLines.push(stripeOptionText);
    }
    if (includeBizum && bizumOptionText) {
      paymentLines.push(bizumOptionText);
    }
    if (includeBonoOption && bonoOptionText) {
      paymentLines.push(bonoOptionText);
    }

    // Construct full message
    let fullMessage = baseMessage;
    
    if (channel === 'email') {
      const paymentIntro = currentTemplate?.email_payment_text ?? defaults.email_payment_text ?? '';
      const footer = currentTemplate?.email_footer ?? defaults.email_footer ?? '';
      
      const parts = [baseMessage];
      if (paymentLines.length > 0) {
        parts.push(paymentIntro + '\n' + paymentLines.join('\n'));
      }
      if (footer) parts.push(footer);
      
      fullMessage = parts.filter(Boolean).join('\n\n');
    } else {
      if (paymentLines.length > 0) {
        fullMessage += '\n\n' + paymentLines.join('\n');
      }
    }

    // Replace variables with preview values
    const sessionDate = debt.due_date 
      ? format(new Date(debt.due_date), "d 'de' MMMM 'de' yyyy", { locale: es })
      : 'N/A';
    
    const bizumPhone = center.bizum_phone || '609555514';
    
    const preview = fullMessage
      .replace(/{nombre_paciente}/g, debt.patients.first_name)
      .replace(/{centro_nombre}/g, center.name || 'Centro')
      .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2))
      .replace(/{importe_total}/g, Number(debt.amount).toFixed(2))
      .replace(/{fecha_sesion}/g, sessionDate)
      .replace(/{bizum_numero}/g, bizumPhone)
      .replace(/{link_pago_stripe}/g, '[Link de pago]')
      .replace(/{link_comprar_bono}/g, '[Link de bono]');

    setMessagePreview(preview.trim());
  }, [debt, center, channel, emailTemplate, whatsappTemplate, smsTemplate, 
      includeStripeLink, includeBizum, includeBonoOption, pendingAmount]);

  const handleSend = async () => {
    if (!debt || !center) return;

    const recipient = channel === 'email' ? patientEmail : patientPhone;
    if (!recipient) {
      toast.error(`El contacto no tiene ${channel === 'email' ? 'email' : 'teléfono'} registrado`);
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
        body: {
          debt_id: debt.id,
          channel,
          include_stripe_link: includeStripeLink,
          include_bizum: includeBizum,
          include_bono_option: includeBonoOption,
        },
      });

      if (error) throw error;

      if (data.whatsappWebLink) {
        // Open WhatsApp Web link for manual sending
        window.open(data.whatsappWebLink, '_blank');
        toast.success('Se ha abierto WhatsApp Web para enviar el mensaje');
      } else {
        toast.success('Recordatorio de pago enviado correctamente');
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      toast.error('Error al enviar el recordatorio');
    } finally {
      setIsSending(false);
    }
  };

  if (!debt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Enviar recordatorio de pago</DialogTitle>
          <DialogDescription>
            Envía un recordatorio a {patientName} por el pago pendiente de {pendingAmount.toFixed(2)}€
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Channel selector */}
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="whatsapp" disabled={!canSendWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="email" disabled={!canSendEmail}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </TabsTrigger>
              <TabsTrigger value="sms" disabled={!canSendSms}>
                <Smartphone className="h-4 w-4 mr-2" />
                SMS
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Contact info warning */}
          {((channel === 'email' && !canSendEmail) || 
            (channel === 'whatsapp' && !canSendWhatsApp) ||
            (channel === 'sms' && !canSendSms)) && (
            <Alert variant="destructive">
              <AlertDescription>
                El contacto no tiene {channel === 'email' ? 'email' : 'teléfono'} registrado.
              </AlertDescription>
            </Alert>
          )}

          {/* Payment options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Opciones de pago a incluir</Label>
            
            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <Checkbox 
                id="stripe" 
                checked={includeStripeLink} 
                onCheckedChange={(checked) => setIncludeStripeLink(!!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="stripe" className="flex items-center gap-2 cursor-pointer">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  Enlace de pago con tarjeta (Stripe)
                </Label>
                <p className="text-xs text-muted-foreground">
                  El contacto podrá pagar directamente con tarjeta
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <Checkbox 
                id="bizum" 
                checked={includeBizum} 
                onCheckedChange={(checked) => setIncludeBizum(!!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="bizum" className="flex items-center gap-2 cursor-pointer">
                  <Smartphone className="h-4 w-4 text-green-600" />
                  Número de Bizum ({(center as any)?.bizum_phone || '609555514'})
                </Label>
                <p className="text-xs text-muted-foreground">
                  El contacto puede enviar Bizum al número indicado
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 border rounded-lg">
              <Checkbox 
                id="bono" 
                checked={includeBonoOption} 
                onCheckedChange={(checked) => setIncludeBonoOption(!!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="bono" className="flex items-center gap-2 cursor-pointer">
                  <Wallet className="h-4 w-4 text-purple-600" />
                  Opción de comprar bono
                </Label>
                <p className="text-xs text-muted-foreground">
                  El contacto puede comprar un bono de sesiones con descuento
                </p>
              </div>
            </div>
          </div>

          {/* Message preview */}
          <div className="space-y-2">
            <Label>Vista previa del mensaje</Label>
            <Textarea 
              value={messagePreview} 
              readOnly 
              rows={6}
              className="bg-muted/50 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={isSending || 
              (channel === 'email' && !canSendEmail) ||
              (channel === 'whatsapp' && !canSendWhatsApp) ||
              (channel === 'sms' && !canSendSms)}
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                {channel === 'email' && <Mail className="mr-2 h-4 w-4" />}
                {channel === 'whatsapp' && <MessageCircle className="mr-2 h-4 w-4" />}
                {channel === 'sms' && <Smartphone className="mr-2 h-4 w-4" />}
                Enviar recordatorio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

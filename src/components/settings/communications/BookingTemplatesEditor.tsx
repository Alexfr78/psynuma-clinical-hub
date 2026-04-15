import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, RotateCcw, Info, CalendarCheck2 } from 'lucide-react';
import { TemplateVariableBadges } from './TemplateVariableBadges';
import {
  useCommunicationTemplate,
  useUpsertCommunicationTemplate,
  DEFAULT_TEMPLATES,
  BOOKING_TEMPLATE_VARIABLES,
  BookingAudience,
  BookingEvent,
  bookingTemplateType,
  TemplateChannel,
} from '@/hooks/useCommunicationTemplates';

const EVENT_LABELS: Record<BookingEvent, string> = {
  created: 'Cita creada',
  rescheduled: 'Cita reprogramada',
  cancelled: 'Cita cancelada',
};

const AUDIENCE_LABELS: Record<BookingAudience, string> = {
  patient: 'Paciente',
  professional: 'Profesional',
};

export function BookingTemplatesEditor() {
  const [audience, setAudience] = useState<BookingAudience>('patient');
  const [event, setEvent] = useState<BookingEvent>('created');
  const [channel, setChannel] = useState<TemplateChannel>('email');

  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailFooter, setEmailFooter] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const whatsappRef = useRef<HTMLTextAreaElement | null>(null);

  const templateType = bookingTemplateType(event, audience);
  const { data: template, isLoading } = useCommunicationTemplate(channel, templateType);
  const upsertMutation = useUpsertCommunicationTemplate();

  const defaults = useMemo(() => DEFAULT_TEMPLATES[channel][templateType] ?? {}, [channel, templateType]);

  useEffect(() => {
    setEmailSubject(template?.email_subject ?? defaults.email_subject ?? '');
    setEmailBody(template?.email_initial_text ?? defaults.email_initial_text ?? '');
    setEmailFooter(template?.email_footer ?? defaults.email_footer ?? '');
    setWhatsappMessage(template?.whatsapp_message ?? defaults.whatsapp_message ?? '');
  }, [template, defaults]);

  const insertVariable = (variable: string, target: 'body' | 'whatsapp') => {
    const ref = target === 'body' ? bodyRef.current : whatsappRef.current;
    const current = target === 'body' ? emailBody : whatsappMessage;
    const setCurrent = target === 'body' ? setEmailBody : setWhatsappMessage;
    if (!ref) return;
    const start = ref.selectionStart;
    const end = ref.selectionEnd;
    const newValue = current.slice(0, start) + variable + current.slice(end);
    setCurrent(newValue);
    setTimeout(() => {
      ref.focus();
      const pos = start + variable.length;
      ref.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleSave = () => {
    if (channel === 'email') {
      upsertMutation.mutate({
        channel,
        template_type: templateType,
        email_subject: emailSubject,
        email_initial_text: emailBody,
        email_footer: emailFooter,
      });
    } else {
      upsertMutation.mutate({
        channel,
        template_type: templateType,
        whatsapp_message: whatsappMessage,
      });
    }
  };

  const handleReset = () => {
    if (channel === 'email') {
      setEmailSubject(defaults.email_subject ?? '');
      setEmailBody(defaults.email_initial_text ?? '');
      setEmailFooter(defaults.email_footer ?? '');
    } else {
      setWhatsappMessage(defaults.whatsapp_message ?? '');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          <CardTitle>Plantillas de confirmación de citas</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes que se envían al paciente y al profesional cuando se crea, reprograma o cancela una cita.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Las variables entre llaves se reemplazan al enviar. Si una variable no aplica (por ejemplo, motivo sin valor), se sustituirá por vacío.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Destinatario</Label>
            <Tabs value={audience} onValueChange={(v) => setAudience(v as BookingAudience)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="patient">{AUDIENCE_LABELS.patient}</TabsTrigger>
                <TabsTrigger value="professional">{AUDIENCE_LABELS.professional}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-2">
            <Label>Evento</Label>
            <Tabs value={event} onValueChange={(v) => setEvent(v as BookingEvent)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="created">Creada</TabsTrigger>
                <TabsTrigger value="rescheduled">Reprogramada</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelada</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Tabs value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Editando: <span className="font-medium text-foreground">{EVENT_LABELS[event]}</span> · {AUDIENCE_LABELS[audience]} · {channel === 'email' ? 'Email' : 'WhatsApp'}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : channel === 'email' ? (
          <div className="space-y-4">
            <TemplateVariableBadges
              variables={BOOKING_TEMPLATE_VARIABLES}
              onVariableClick={(v) => insertVariable(v, 'body')}
            />
            <div className="space-y-2">
              <Label htmlFor="email_subject">Asunto</Label>
              <Input
                id="email_subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Asunto del email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_body">Cuerpo del mensaje</Label>
              <Textarea
                id="email_body"
                ref={bodyRef}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_footer">Pie / firma</Label>
              <Textarea
                id="email_footer"
                value={emailFooter}
                onChange={(e) => setEmailFooter(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <TemplateVariableBadges
              variables={BOOKING_TEMPLATE_VARIABLES}
              onVariableClick={(v) => insertVariable(v, 'whatsapp')}
            />
            <div className="space-y-2">
              <Label htmlFor="whatsapp_message">Mensaje de WhatsApp</Label>
              <Textarea
                id="whatsapp_message"
                ref={whatsappRef}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                rows={10}
              />
              <p className="text-xs text-muted-foreground">{whatsappMessage.length} caracteres</p>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleReset} disabled={isLoading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Usar texto por defecto
          </Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending || isLoading}>
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

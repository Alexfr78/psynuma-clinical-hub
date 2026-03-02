import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Assessment, useAssessments } from '@/hooks/useAssessments';
import { Copy, MessageCircle, Check, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useCenter } from '@/hooks/useCenter';
import { WhatsAppLinkDialog } from '@/components/agenda/WhatsAppLinkDialog';

interface SendAssessmentDialogProps {
  assessment: Assessment | null;
  onClose: () => void;
}

export function SendAssessmentDialog({ assessment, onClose }: SendAssessmentDialogProps) {
  const { resendAssessment } = useAssessments();
  const { sendWhatsApp, isAutomatic, methodLabel } = useWhatsAppDelivery();
  const { center } = useCenter();

  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [manualLink, setManualLink] = useState('');

  const link = assessment ? `${window.location.origin}/evaluacion/${assessment.access_token}` : '';
  const patientName = assessment?.patient ? assessment.patient.first_name : '';
  const patientPhone = assessment?.patient?.phone || '';

  const message = `Hola${patientName ? ` ${patientName}` : ''}, te envío el siguiente cuestionario para que lo completes cuando puedas:\n\n${link}\n\nSi tienes cualquier duda, no dudes en consultarme.`;

  const handleOpen = (open: boolean) => {
    if (!open) onClose();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    toast.success('Mensaje copiado');
  };

  const handleSendWhatsApp = async () => {
    if (!assessment || !patientPhone || !center?.id) return;

    setIsSending(true);
    try {
      const result = await sendWhatsApp({
        phone: patientPhone,
        message,
        patientId: assessment.patient_id,
        patientName: patientName || 'Contacto',
        centerId: center.id,
        messageType: 'assessment',
      });

      if (result.manualLink) {
        setManualLink(result.manualLink);
        setWhatsAppDialogOpen(true);
      } else if (result.result.autoSent) {
        // Update DB with sent info
        await resendAssessment.mutateAsync({
          id: assessment.id,
          sent_via: 'whatsapp',
          sent_to: patientPhone,
        });
        onClose();
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Dialog open={!!assessment} onOpenChange={handleOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Enviar evaluación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-hidden">
            {/* Link Section */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Enlace de evaluación</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded bg-muted px-3 py-2 text-xs break-all">
                  {link}
                </code>
                <Button size="icon" variant="outline" className="shrink-0" onClick={handleCopyLink}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* WhatsApp Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Enviar por WhatsApp</p>
                <Badge variant="outline" className="text-xs">
                  {methodLabel}
                </Badge>
              </div>

              {patientPhone ? (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3"
                  onClick={handleSendWhatsApp}
                  disabled={isSending}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-green-500" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-green-500" />
                  )}
                  {isSending
                    ? 'Enviando...'
                    : isAutomatic
                      ? 'Enviar WhatsApp automático'
                      : 'Abrir WhatsApp'
                  }
                  {isAutomatic && !isSending && (
                    <Send className="h-3 w-3 ml-auto opacity-50" />
                  )}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  El paciente no tiene teléfono registrado
                </p>
              )}
            </div>

            {/* Copy Message */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={handleCopyMessage}
              >
                <Copy className="h-4 w-4" />
                Copiar mensaje completo
              </Button>
            </div>

            {/* Message Preview */}
            <div className="space-y-2 overflow-hidden">
              <p className="text-sm font-medium">Vista previa del mensaje</p>
              <div className="max-h-[150px] overflow-auto rounded-lg bg-muted p-3">
                <pre className="whitespace-pre-wrap break-all text-xs">{message}</pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WhatsAppLinkDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        phone={patientPhone}
        message={message}
        patientName={patientName || 'Contacto'}
      />
    </>
  );
}

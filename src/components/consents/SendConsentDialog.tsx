import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Consent } from '@/hooks/useConsents';
import { Copy, MessageCircle, Mail, ExternalLink, Check, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface SendConsentDialogProps {
  consent: Consent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendConsentDialog({
  consent,
  open,
  onOpenChange,
}: SendConsentDialogProps) {
  const [copied, setCopied] = useState(false);

  const consentUrl = `${window.location.origin}/consentimiento/${consent.access_token}`;
  const patientName = consent.patient
    ? `${consent.patient.first_name} ${consent.patient.last_name}`
    : 'el paciente';

  const message = `Hola ${patientName},

Por favor, firma el consentimiento informado accediendo al siguiente enlace:

${consentUrl}

Este enlace es personal e intransferible.

Saludos,
${consent.professional?.first_name || 'Tu profesional'}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(consentUrl);
    setCopied(true);
    toast.success('Enlace copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    toast.success('Mensaje copiado');
  };

  const handleWhatsAppApp = () => {
    // Get patient phone from the consent
    const phone = ''; // Would need to fetch from patient
    const encodedMessage = encodeURIComponent(message);
    window.open(`whatsapp://send?text=${encodedMessage}`, '_blank');
  };

  const handleWhatsAppWeb = () => {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encodedMessage}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar enlace de firma</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Link Section */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Enlace de firma</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                {consentUrl}
              </code>
              <Button size="icon" variant="outline" onClick={handleCopyLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Send Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Enviar por</p>
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-start gap-3"
                onClick={handleWhatsAppApp}
              >
                <Smartphone className="h-4 w-4 text-green-500" />
                WhatsApp (App)
                <span className="ml-auto text-xs text-muted-foreground">
                  Funciona siempre
                </span>
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-3"
                onClick={handleWhatsAppWeb}
              >
                <MessageCircle className="h-4 w-4 text-green-500" />
                WhatsApp Web
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-3"
                onClick={handleCopyMessage}
              >
                <Copy className="h-4 w-4" />
                Copiar mensaje completo
              </Button>
            </div>
          </div>

          {/* Message Preview */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Vista previa del mensaje</p>
            <div className="max-h-[150px] overflow-auto rounded-lg bg-muted p-3">
              <pre className="whitespace-pre-wrap text-xs">{message}</pre>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

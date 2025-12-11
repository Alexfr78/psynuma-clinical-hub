import { useState } from 'react';
import { Copy, ExternalLink, Check, MessageCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { generateWhatsAppUniversalLink, generateWhatsAppNativeLink } from '@/lib/whatsapp';

interface WhatsAppLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  message: string;
  patientName: string;
}

export function WhatsAppLinkDialog({
  open,
  onOpenChange,
  phone,
  message,
  patientName,
}: WhatsAppLinkDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const universalLink = generateWhatsAppUniversalLink(phone, message);
  const nativeLink = generateWhatsAppNativeLink(phone, message);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(universalLink);
      setCopiedLink(true);
      toast.success('Enlace copiado');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMessage(true);
      toast.success('Mensaje copiado');
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      toast.error('No se pudo copiar el mensaje');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Enviar WhatsApp a {patientName}
          </DialogTitle>
          <DialogDescription>
            Elige cómo quieres enviar el mensaje de WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Option 1: Native App */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Opción 1: Abrir en la app</label>
            <Button asChild className="w-full bg-green-600 hover:bg-green-700">
              <a href={nativeLink}>
                <Smartphone className="h-4 w-4 mr-2" />
                Abrir WhatsApp (App instalada)
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Abre directamente WhatsApp si está instalado en tu dispositivo.
            </p>
          </div>

          {/* Option 2: Universal Link (wa.me) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Opción 2: Enlace universal</label>
            <div className="flex gap-2">
              <a
                href={universalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 p-3 text-sm bg-muted rounded-md hover:bg-muted/80 transition-colors flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-primary underline underline-offset-2">
                  wa.me (nueva pestaña)
                </span>
              </a>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copiedLink ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Si no abre automáticamente, copia el enlace y pégalo en una nueva pestaña.
            </p>
          </div>

          {/* Message Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Vista previa del mensaje</label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 text-sm bg-muted rounded-md max-h-24 overflow-y-auto whitespace-pre-wrap">
                {message}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyMessage}
                className="shrink-0"
              >
                {copiedMessage ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

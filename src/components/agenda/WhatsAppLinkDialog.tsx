import { useState } from 'react';
import { Copy, ExternalLink, Check, MessageCircle } from 'lucide-react';
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

interface WhatsAppLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webLink: string;
  message: string;
  patientName: string;
}

export function WhatsAppLinkDialog({
  open,
  onOpenChange,
  webLink,
  message,
  patientName,
}: WhatsAppLinkDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(webLink);
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
            Haz clic en el enlace o cópialo para abrir WhatsApp Web manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* WhatsApp Link */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Enlace de WhatsApp</label>
            <div className="flex gap-2">
              <a
                href={webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 p-3 text-sm bg-muted rounded-md break-all hover:bg-muted/80 transition-colors flex items-start gap-2"
              >
                <ExternalLink className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span className="text-primary underline underline-offset-2">
                  Abrir en WhatsApp Web
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
              Si el enlace no abre automáticamente, haz clic derecho → "Abrir en nueva pestaña"
            </p>
          </div>

          {/* Message Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Mensaje</label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 text-sm bg-muted rounded-md max-h-32 overflow-y-auto whitespace-pre-wrap">
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button asChild className="bg-green-600 hover:bg-green-700">
            <a href={webLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir WhatsApp
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

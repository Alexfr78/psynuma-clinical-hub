import { useState, useCallback } from 'react';
import { Copy, ExternalLink, Check, MessageCircle, Smartphone, Monitor, Loader2 } from 'lucide-react';
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
import { 
  generateWhatsAppWebLink, 
  generateWhatsAppUniversalLink,
  openWhatsAppSmart,
  isMobileDevice 
} from '@/lib/whatsapp';

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
  const [copiedWebLink, setCopiedWebLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const universalLink = generateWhatsAppUniversalLink(phone, message);
  const webLink = generateWhatsAppWebLink(phone, message);
  const isMobile = isMobileDevice();

  const handleSmartOpen = useCallback(async () => {
    setIsOpening(true);
    try {
      const result = await openWhatsAppSmart(phone, message);
      if (result.fallback) {
        toast.info('App no detectada', {
          description: 'Abriendo enlace universal de WhatsApp.',
        });
      }
      // Close dialog after attempting to open
      setTimeout(() => onOpenChange(false), 500);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      toast.error('Error al abrir WhatsApp');
    } finally {
      setIsOpening(false);
    }
  }, [phone, message, onOpenChange]);

  const handleOpenWeb = useCallback(() => {
    window.open(webLink, '_blank');
    toast.success('WhatsApp Web abierto', {
      description: 'Envía el mensaje desde la nueva pestaña.',
    });
  }, [webLink]);

  const handleCopyUniversalLink = async () => {
    try {
      await navigator.clipboard.writeText(universalLink);
      setCopiedLink(true);
      toast.success('Enlace wa.me copiado');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleCopyWebLink = async () => {
    try {
      await navigator.clipboard.writeText(webLink);
      setCopiedWebLink(true);
      toast.success('Enlace WhatsApp Web copiado');
      setTimeout(() => setCopiedWebLink(false), 2000);
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
          {/* Primary Option: Smart Open */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              Opción recomendada
              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                {isMobile ? 'Móvil detectado' : 'Escritorio'}
              </span>
            </label>
            <Button 
              onClick={handleSmartOpen}
              disabled={isOpening}
              className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
            >
              {isOpening ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : isMobile ? (
                <Smartphone className="h-5 w-5 mr-2" />
              ) : (
                <ExternalLink className="h-5 w-5 mr-2" />
              )}
              {isOpening ? 'Abriendo...' : 'Abrir WhatsApp'}
            </Button>
            <p className="text-xs text-muted-foreground">
              {isMobile 
                ? 'Abre la app de WhatsApp si está instalada, o el enlace universal si no.'
                : 'Abre el enlace universal wa.me en una nueva pestaña.'
              }
            </p>
          </div>

          {/* Alternative: WhatsApp Web (Desktop only shows this prominently) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Alternativa: WhatsApp Web
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleOpenWeb}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir web.whatsapp.com
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyWebLink}
                title="Copiar enlace de WhatsApp Web"
              >
                {copiedWebLink ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Links Section */}
          <div className="space-y-3 pt-2 border-t">
            <label className="text-sm font-medium">Enlaces</label>
            
            {/* Universal Link (wa.me) */}
            <div className="space-y-1">
              <div className="flex gap-2">
                <div className="flex-1 p-2 text-xs bg-muted rounded-md overflow-hidden">
                  <span className="text-muted-foreground break-all">{universalLink}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyUniversalLink}
                  title="Copiar enlace wa.me"
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
                Enlace universal (wa.me) - Funciona en móvil y escritorio
              </p>
            </div>
          </div>

          {/* Message Preview */}
          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium">Vista previa del mensaje</label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 text-sm bg-muted rounded-md max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                {message}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyMessage}
                className="shrink-0"
                title="Copiar mensaje"
              >
                {copiedMessage ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Testing Instructions */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Instrucciones de prueba por dispositivo
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              <li><strong>iOS Safari/Chrome:</strong> Debería abrir la app WhatsApp directamente.</li>
              <li><strong>Android Chrome:</strong> Abre la app o muestra selector de apps.</li>
              <li><strong>Windows Chrome/Edge:</strong> Abre wa.me en nueva pestaña.</li>
              <li><strong>Mac Safari/Chrome:</strong> Abre wa.me, puede preguntar si abrir app.</li>
            </ul>
          </details>
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

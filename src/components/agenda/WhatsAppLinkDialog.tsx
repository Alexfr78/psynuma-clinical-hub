import { useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  openWhatsAppSmart,
} from '@/lib/whatsapp';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCenter } from '@/hooks/useCenter';
import { useWasender } from '@/hooks/useWasender';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/icon';

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
  const [isOpening, setIsOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();
  const { center } = useCenter();
  const { isConnected: wasenderConnected } = useWasender();

  // Check if WasenderAPI is enabled but not connected (show hint)
  const showWasenderHint = center?.wasender_enabled && !wasenderConnected;

  const handleSmartOpen = useCallback(async () => {
    setIsOpening(true);
    try {
      // On desktop we prefer WhatsApp Web to avoid opening the native desktop app.
      const preferredMethod = !isMobile ? 'web' : undefined;
      const result = await openWhatsAppSmart(phone, message, preferredMethod);
      if (result.fallback) {
        toast.info('App no detectada', {
          description: 'Abriendo enlace de WhatsApp.',
        });
      }
      setTimeout(() => onOpenChange(false), 500);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      toast.error('Error al abrir WhatsApp');
    } finally {
      setIsOpening(false);
    }
  }, [phone, message, onOpenChange, isMobile]);

  const handleCopyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Mensaje copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('No se pudo copiar');
    }
  }, [message]);

  const dialogContent = (
    <div className="space-y-4">
      {/* Hint when WasenderAPI is enabled but not connected */}
      {showWasenderHint && (
        <Alert variant="default" className="bg-muted/50">
          <Icon name="error" className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Conecta WasenderAPI para envíos automáticos.{' '}
            <Link 
              to="/settings" 
              className="text-primary underline font-medium"
              onClick={() => onOpenChange(false)}
            >
              Ir a Configuración
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Message preview */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Vista previa del mensaje</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleCopyMessage}
          >
            {copied ? (
              <Icon name="check" className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Icon name="content_copy" className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <ScrollArea className="max-h-32">
          <p className="text-sm whitespace-pre-wrap">{message}</p>
        </ScrollArea>
      </div>

      {/* Send button */}
      <Button 
        onClick={handleSmartOpen}
        disabled={isOpening}
        className="w-full h-11"
      >
        {isOpening ? (
          <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Icon name="send" className="h-4 w-4 mr-2" />
        )}
        {isOpening ? 'Abriendo...' : 'Enviar WhatsApp'}
      </Button>

      {/* Phone number */}
      <p className="text-xs text-muted-foreground text-center">
        Tel: {phone}
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-8 max-h-[90vh] overflow-y-auto">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Icon name="chat" className="h-5 w-5 text-primary" />
              Enviar WhatsApp a {patientName}
            </DrawerTitle>
            <DrawerDescription>
              Se abrirá WhatsApp para enviar el mensaje.
            </DrawerDescription>
          </DrawerHeader>
          {dialogContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="chat" className="h-5 w-5 text-primary" />
            Enviar WhatsApp a {patientName}
          </DialogTitle>
          <DialogDescription>
            Se abrirá WhatsApp para enviar el mensaje.
          </DialogDescription>
        </DialogHeader>
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}

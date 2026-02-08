import { useState, useCallback } from 'react';
import { MessageCircle, Loader2, Copy, Check, Send } from 'lucide-react';
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
import { toast } from 'sonner';
import { 
  generateWhatsAppWebLink, 
  openWhatsAppSmart,
} from '@/lib/whatsapp';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';

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

  const handleSmartOpen = useCallback(async () => {
    setIsOpening(true);
    try {
      const result = await openWhatsAppSmart(phone, message);
      if (result.fallback) {
        toast.info('App no detectada', {
          description: 'Abriendo enlace universal de WhatsApp.',
        });
      }
      setTimeout(() => onOpenChange(false), 500);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      toast.error('Error al abrir WhatsApp');
    } finally {
      setIsOpening(false);
    }
  }, [phone, message, onOpenChange]);

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
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
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
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Send className="h-4 w-4 mr-2" />
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
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Enviar WhatsApp a {patientName}
            </DrawerTitle>
            <DrawerDescription>
              Abre WhatsApp para enviar el mensaje manualmente.
            </DrawerDescription>
          </DrawerHeader>
          {dialogContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Enviar WhatsApp a {patientName}
          </DialogTitle>
          <DialogDescription>
            Abre WhatsApp para enviar el mensaje manualmente.
          </DialogDescription>
        </DialogHeader>
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}

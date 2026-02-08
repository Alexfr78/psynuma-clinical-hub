import { useState, useCallback } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
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
  const [isOpening, setIsOpening] = useState(false);

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
    toast.success('WhatsApp Web abierto');
    onOpenChange(false);
  }, [webLink, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Enviar WhatsApp
          </DialogTitle>
          <DialogDescription>
            ¿Deseas enviar el recordatorio a {patientName}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Button 
            onClick={handleSmartOpen}
            disabled={isOpening}
            className="w-full h-11 bg-green-600 hover:bg-green-700"
          >
            {isOpening ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4 mr-2" />
            )}
            {isOpening ? 'Abriendo...' : isMobile ? 'Abrir WhatsApp' : 'Enviar por WhatsApp'}
          </Button>
          
          {!isMobile && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleOpenWeb}
            >
              Abrir en WhatsApp Web
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

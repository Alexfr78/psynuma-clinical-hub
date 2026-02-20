import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Mail, Phone, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useSendInvoiceNotification } from '@/hooks/useSendInvoiceNotification';
import { useIsMobile } from '@/hooks/use-mobile';

interface SendInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total: number;
    patients: {
      id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
      phone?: string | null;
    };
  } | null;
}

export function SendInvoiceDialog({ open, onOpenChange, invoice }: SendInvoiceDialogProps) {
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'both'>('email');
  const sendInvoice = useSendInvoiceNotification();
  const isMobile = useIsMobile();

  if (!invoice) return null;

  const patient = invoice.patients;
  const hasEmail = !!patient.email;
  const hasPhone = !!patient.phone;

  const canSend = 
    (channel === 'email' && hasEmail) ||
    (channel === 'whatsapp' && hasPhone) ||
    (channel === 'both' && (hasEmail || hasPhone));

  const handleSend = async () => {
    const result = await sendInvoice.mutateAsync({
      invoiceId: invoice.id,
      patientId: patient.id,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      channel,
    });
    
    // If WhatsApp web mode, open the link before closing dialog
    if (result?.whatsappSendMethod === 'web' && result?.whatsappLink) {
      window.open(result.whatsappLink, '_blank');
    }
    
    onOpenChange(false);
  };

  const content = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Paciente</p>
        <p className="font-medium">{patient.first_name} {patient.last_name}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Datos de contacto</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{patient.email || 'No disponible'}</span>
            {hasEmail ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{patient.phone || 'No disponible'}</span>
            {hasPhone ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Canal de envío</p>
        <RadioGroup value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="email" id="send-inv-email" disabled={!hasEmail} />
            <Label htmlFor="send-inv-email" className={!hasEmail ? 'text-muted-foreground' : ''}>
              Email
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="whatsapp" id="send-inv-whatsapp" disabled={!hasPhone} />
            <Label htmlFor="send-inv-whatsapp" className={!hasPhone ? 'text-muted-foreground' : ''}>
              WhatsApp
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="both" id="send-inv-both" disabled={!hasEmail && !hasPhone} />
            <Label htmlFor="send-inv-both" className={!hasEmail && !hasPhone ? 'text-muted-foreground' : ''}>
              Ambos
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="rounded-md bg-muted p-3">
        <p className="text-sm font-medium">Total: {invoice.total.toFixed(2)} €</p>
      </div>
    </div>
  );

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancelar
      </Button>
      <Button onClick={handleSend} disabled={!canSend || sendInvoice.isPending}>
        {sendInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar factura
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Enviar Factura {invoice.invoice_number}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2 overflow-y-auto">
            {content}
          </div>
          <DrawerFooter className="flex-row justify-end gap-2 pt-2">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Factura {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        {content}
        <DialogFooter>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

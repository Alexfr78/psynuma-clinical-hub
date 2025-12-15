import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Mail, Phone, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useSendInvoiceNotification } from '@/hooks/useSendInvoiceNotification';

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

  if (!invoice) return null;

  const patient = invoice.patients;
  const hasEmail = !!patient.email;
  const hasPhone = !!patient.phone;

  const canSend = 
    (channel === 'email' && hasEmail) ||
    (channel === 'whatsapp' && hasPhone) ||
    (channel === 'both' && (hasEmail || hasPhone));

  const handleSend = async () => {
    await sendInvoice.mutateAsync({
      invoiceId: invoice.id,
      patientId: patient.id,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      channel,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Factura {invoice.invoice_number}</DialogTitle>
        </DialogHeader>

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
                <RadioGroupItem value="email" id="email" disabled={!hasEmail} />
                <Label htmlFor="email" className={!hasEmail ? 'text-muted-foreground' : ''}>
                  Email
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="whatsapp" id="whatsapp" disabled={!hasPhone} />
                <Label htmlFor="whatsapp" className={!hasPhone ? 'text-muted-foreground' : ''}>
                  WhatsApp
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="both" disabled={!hasEmail && !hasPhone} />
                <Label htmlFor="both" className={!hasEmail && !hasPhone ? 'text-muted-foreground' : ''}>
                  Ambos
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">Total: {invoice.total.toFixed(2)} €</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!canSend || sendInvoice.isPending}>
            {sendInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

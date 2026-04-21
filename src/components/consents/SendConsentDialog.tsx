import { useState } from "react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Consent } from "@/hooks/useConsents";
import { Copy, MessageCircle, Check, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWhatsAppDelivery } from "@/hooks/useWhatsAppDelivery";
import { useCenter } from "@/hooks/useCenter";
import { WhatsAppLinkDialog } from "@/components/agenda/WhatsAppLinkDialog";
import { Badge } from "@/components/ui/badge";

interface SendConsentDialogProps {
  consent: Consent;
  patientPhone?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendConsentDialog({ consent, patientPhone, open, onOpenChange }: SendConsentDialogProps) {
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [manualLink, setManualLink] = useState("");

  const { sendWhatsApp, deliveryMethod, isAutomatic, methodLabel } = useWhatsAppDelivery();
  const { center } = useCenter();

  const consentUrl = `${window.location.origin}/consentimiento/${consent.access_token}`;
  const patientName = consent.patient ? `${consent.patient.first_name}` : "";
  const phone = patientPhone ?? consent.patient?.phone ?? null;

  const message = `Buenos días${patientName ? ` ${patientName}` : ""}, tal y como te comenté, te adjunto el acuerdo de consentimiento para la protección de datos. Al final de la lectura encontrás los campos para Autorizar o No el consentimiento.

${consentUrl}

Si tienes cualquier consulta, no dudes en avisarme.`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(consentUrl);
    setCopied(true);
    toast.success("Enlace copiado");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message);
    toast.success("Mensaje copiado");
  };

  const handleSendWhatsApp = async () => {
    if (!phone) {
      toast.error("Sin teléfono", {
        description: "El paciente no tiene número de teléfono registrado.",
      });
      return;
    }

    if (!center?.id) return;

    setIsSending(true);
    try {
      const result = await sendWhatsApp({
        phone,
        message,
        patientId: consent.patient_id,
        patientName: patientName || "Contacto",
        centerId: center.id,
        messageType: "consent",
      });

      if (result.manualLink) {
        // Manual mode - show WhatsApp dialog
        setManualLink(result.manualLink);
        setWhatsAppDialogOpen(true);
      } else if (result.result.autoSent) {
        // Auto sent successfully - close dialog
        onOpenChange(false);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Enviar enlace de firma</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-hidden">
            {/* Link Section */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Enlace de firma</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded bg-muted px-3 py-2 text-xs break-all">
                  {consentUrl}
                </code>
                <Button size="icon" variant="outline" className="shrink-0" onClick={handleCopyLink}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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

              {phone ? (
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
                  {isSending ? "Enviando..." : isAutomatic ? "Enviar WhatsApp automático" : "Abrir WhatsApp"}
                  {isAutomatic && !isSending && <Send className="h-3 w-3 ml-auto opacity-50" />}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  El paciente no tiene teléfono registrado
                </p>
              )}
            </div>

            {/* Copy Message */}
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3" onClick={handleCopyMessage}>
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Manual Link Dialog */}
      <WhatsAppLinkDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        phone={patientPhone || ""}
        message={message}
        patientName={patientName || "Contacto"}
      />
    </>
  );
}

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoregistroTemplates } from '@/hooks/useAutoregistroTemplates';
import { useAutoregistroLinks } from '@/hooks/useAutoregistroLinks';
import { usePatients } from '@/hooks/usePatients';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useAuth } from '@/hooks/useAuth';
import { Copy, Check, MessageCircle, Loader2 } from 'lucide-react';

interface SendAutoregistroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
}

export function SendAutoregistroDialog({ open, onOpenChange, preselectedPatientId }: SendAutoregistroDialogProps) {
  const [templateId, setTemplateId] = useState('');
  const [patientId, setPatientId] = useState(preselectedPatientId ?? '');
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  const { data: templates } = useAutoregistroTemplates();
  const { createLink } = useAutoregistroLinks();
  const { data: patients } = usePatients();
  const { sendWhatsApp, getManualLink } = useWhatsAppDelivery();
  const { profile } = useAuth();

  const activeTemplates = (templates ?? []).filter((t) => t.is_active);
  const selectedPatient = (patients ?? []).find((p) => p.id === patientId);

  const handleCreate = () => {
    if (!templateId || !patientId) return;
    createLink.mutate(
      {
        template_id: templateId,
        patient_id: patientId,
        allow_multiple: allowMultiple,
        expires_at: expiresAt || undefined,
      },
      {
        onSuccess: (data: any) => {
          const url = `${window.location.origin}/registro/${data.access_token}`;
          setGeneratedLink(url);
        },
      }
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = async () => {
    if (!selectedPatient || !generatedLink) return;
    const patientName = `${selectedPatient.first_name} ${selectedPatient.last_name ?? ''}`.trim();
    const message = `Hola ${selectedPatient.first_name}, aquí tienes el enlace para tu autorregistro:\n${generatedLink}`;
    const phone = (selectedPatient as { phone?: string | null }).phone ?? null;

    if (!phone) {
      const manualLink = getManualLink('', message);
      window.open(manualLink, '_blank');
      return;
    }

    setSendingWa(true);
    try {
      const { result, manualLink } = await sendWhatsApp({
        phone,
        message,
        patientId: selectedPatient.id,
        patientName,
        centerId: profile?.center_id ?? '',
        messageType: 'autoregistro_link',
      });

      if (!result.autoSent && manualLink) {
        window.open(manualLink, '_blank');
      }
    } finally {
      setSendingWa(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setTemplateId('');
      setPatientId(preselectedPatientId ?? '');
      setAllowMultiple(true);
      setExpiresAt('');
      setGeneratedLink('');
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar autorregistro</DialogTitle>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enlace generado. Compártelo con el paciente:</p>
            <div className="flex gap-2">
              <Input value={generatedLink} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={handleWhatsApp} disabled={sendingWa}>
              {sendingWa ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-4 w-4" />
              )}
              Enviar por WhatsApp
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plantilla</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!preselectedPatientId && (
              <div className="space-y-1.5">
                <Label>Paciente</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {(patients ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} id="multi" />
              <Label htmlFor="multi" className="text-sm">Permitir múltiples envíos</Label>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de expiración (opcional)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <Button onClick={handleCreate} disabled={!templateId || !patientId || createLink.isPending} className="w-full">
              {createLink.isPending ? 'Generando...' : 'Generar enlace'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

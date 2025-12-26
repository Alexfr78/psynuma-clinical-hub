import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Assessment, useAssessments } from '@/hooks/useAssessments';
import { Loader2, Mail, MessageCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface SendAssessmentDialogProps {
  assessment: Assessment | null;
  onClose: () => void;
}

export function SendAssessmentDialog({ assessment, onClose }: SendAssessmentDialogProps) {
  const { resendAssessment } = useAssessments();
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [destination, setDestination] = useState('');

  const link = assessment ? `${window.location.origin}/evaluacion/${assessment.access_token}` : '';

  const handleOpen = (open: boolean) => {
    if (!open) {
      onClose();
    } else if (assessment) {
      setChannel(assessment.patient?.email ? 'email' : 'whatsapp');
      setDestination(assessment.patient?.email || assessment.patient?.phone || '');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    toast.success('Enlace copiado');
  };

  const handleSend = async () => {
    if (!assessment || !destination) return;
    
    await resendAssessment.mutateAsync({
      id: assessment.id,
      sent_via: channel,
      sent_to: destination,
    });
    
    onClose();
  };

  return (
    <Dialog open={!!assessment} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar evaluación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Enlace</Label>
            <div className="flex gap-2">
              <Input value={link} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Canal de envío</Label>
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as 'email' | 'whatsapp')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="email" id="email" />
                <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="whatsapp" id="whatsapp" />
                <Label htmlFor="whatsapp" className="flex items-center gap-2 cursor-pointer">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>{channel === 'email' ? 'Email' : 'Teléfono'}</Label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={channel === 'email' ? 'email@ejemplo.com' : '+34600000000'}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={!destination || resendAssessment.isPending}>
              {resendAssessment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

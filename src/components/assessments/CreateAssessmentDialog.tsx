import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePatients } from '@/hooks/usePatients';
import { useAssessmentTemplates } from '@/hooks/useAssessmentTemplates';
import { useAssessments } from '@/hooks/useAssessments';
import { Loader2 } from 'lucide-react';

interface CreateAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
}

export function CreateAssessmentDialog({ open, onOpenChange, preselectedPatientId }: CreateAssessmentDialogProps) {
  const { data: patients = [] } = usePatients();
  const { templates } = useAssessmentTemplates();
  const { createAssessment } = useAssessments();
  
  const [patientId, setPatientId] = useState(preselectedPatientId || '');
  const [templateId, setTemplateId] = useState('');
  const [sendVia, setSendVia] = useState<'email' | 'whatsapp' | ''>('');

  const selectedPatient = patients.find(p => p.id === patientId);
  const sendTo = sendVia === 'email' ? selectedPatient?.email : selectedPatient?.phone;

  const handleSubmit = async () => {
    if (!patientId || !templateId) return;

    await createAssessment.mutateAsync({
      patient_id: patientId,
      template_id: templateId,
      sent_via: sendVia || undefined,
      sent_to: sendTo || undefined,
    });

    onOpenChange(false);
    setPatientId(preselectedPatientId || '');
    setTemplateId('');
    setSendVia('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva Evaluación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paciente</Label>
            <Select value={patientId} onValueChange={setPatientId} disabled={!!preselectedPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un paciente" />
              </SelectTrigger>
              <SelectContent>
                {patients.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plantilla de evaluación</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una plantilla" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Enviar por (opcional)</Label>
            <Select value={sendVia} onValueChange={(v) => setSendVia(v as 'email' | 'whatsapp' | '')}>
              <SelectTrigger>
                <SelectValue placeholder="Solo generar enlace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Solo generar enlace</SelectItem>
                <SelectItem value="email" disabled={!selectedPatient?.email}>Email</SelectItem>
                <SelectItem value="whatsapp" disabled={!selectedPatient?.phone}>WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            {sendVia && sendTo && (
              <p className="text-sm text-muted-foreground">Se enviará a: {sendTo}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!patientId || !templateId || createAssessment.isPending}>
              {createAssessment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear evaluación
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

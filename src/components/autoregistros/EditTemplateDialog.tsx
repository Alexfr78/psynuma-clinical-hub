import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichDescriptionEditor } from './RichDescriptionEditor';
import { sanitizeDescription } from './sanitizeDescription';
import AlertRulesBuilder from './AlertRulesBuilder';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FieldBuilder } from './FieldBuilder';
import type { AutoregistroField, AutoregistroTemplate } from '@/hooks/useAutoregistroTemplates';
import { useAutoregistroTemplates } from '@/hooks/useAutoregistroTemplates';

interface EditTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AutoregistroTemplate | null;
}

export function EditTemplateDialog({ open, onOpenChange, template }: EditTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<AutoregistroField[]>([]);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [feedbackShowDate, setFeedbackShowDate] = useState(true);
  const { updateTemplate } = useAutoregistroTemplates();

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setFields([...template.fields]);
      setFeedbackEnabled(template.patient_feedback_enabled ?? false);
      setFeedbackShowDate(template.patient_feedback_show_date ?? true);
    }
  }, [template]);

  const handleSubmit = () => {
    if (!template || !name.trim() || fields.length === 0) return;
    if (fields.some((f) => !f.label.trim())) return;

    updateTemplate.mutate(
      {
        id: template.id,
        name: name.trim(),
        description: sanitizeDescription(description.trim()) || undefined,
        fields,
        patient_feedback_enabled: feedbackEnabled,
        patient_feedback_show_date: feedbackShowDate,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plantilla</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <RichDescriptionEditor value={description} onChange={setDescription} />
          </div>

          <div className="space-y-1.5">
            <Label>Campos del formulario</Label>
            <FieldBuilder fields={fields} onChange={setFields} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-feedback-toggle" className="text-sm font-medium">Feedback al paciente</Label>
              <p className="text-xs text-muted-foreground">Permitir que el paciente vea sus registros anteriores</p>
            </div>
            <Switch id="edit-feedback-toggle" checked={feedbackEnabled} onCheckedChange={setFeedbackEnabled} />
          </div>

          {feedbackEnabled && fields.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Qué puede ver el paciente</Label>
                <p className="text-xs text-muted-foreground">
                  Selecciona qué campos se mostrarán en "Mis registros anteriores".
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2">
                <span className="text-sm">Mostrar fecha del registro</span>
                <Switch checked={feedbackShowDate} onCheckedChange={setFeedbackShowDate} />
              </div>
              <div className="space-y-2">
                {fields
                  .map((f, originalIndex) => ({ f, originalIndex }))
                  .sort((a, b) => a.f.order - b.f.order)
                  .map(({ f, originalIndex }) => (
                    <div key={`${originalIndex}-${f.label}`} className="flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{f.label || '(Sin nombre)'}</span>
                      <Switch
                        checked={f.patientVisible !== false}
                        onCheckedChange={(v) =>
                          setFields((prev) =>
                            prev.map((pf, i) => (i === originalIndex ? { ...pf, patientVisible: v } : pf))
                          )
                        }
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {template && (
            <div className="space-y-1.5 pt-3 border-t">
              <Label className="text-sm font-medium">Alertas de desregulación</Label>
              <p className="text-xs text-muted-foreground">
                Define condiciones que, al cumplirse, envían una notificación automática al terapeuta.
              </p>
              <AlertRulesBuilder templateId={template.id} fields={fields} />
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || fields.length === 0 || updateTemplate.isPending}
            className="w-full"
          >
            {updateTemplate.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

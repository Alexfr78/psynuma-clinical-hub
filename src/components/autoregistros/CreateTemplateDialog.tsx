import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FieldBuilder } from './FieldBuilder';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { useAutoregistroTemplates } from '@/hooks/useAutoregistroTemplates';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTemplateDialog({ open, onOpenChange }: CreateTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<AutoregistroField[]>([]);
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [feedbackShowDate, setFeedbackShowDate] = useState(true);
  const { createTemplate } = useAutoregistroTemplates();

  const handleSubmit = () => {
    if (!name.trim() || fields.length === 0) return;
    // Validate all fields have labels
    if (fields.some((f) => !f.label.trim())) return;

    createTemplate.mutate(
      {
        name: name.trim(),
        description: sanitizeDescription(description.trim()) || undefined,
        fields,
        patient_feedback_enabled: feedbackEnabled,
        patient_feedback_show_date: feedbackShowDate,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName('');
          setDescription('');
          setFields([]);
          setFeedbackEnabled(false);
          setFeedbackShowDate(true);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva plantilla de autorregistro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Registro de ansiedad" />
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
              <Label htmlFor="feedback-toggle" className="text-sm font-medium">Feedback al paciente</Label>
              <p className="text-xs text-muted-foreground">Permitir que el paciente vea sus registros anteriores</p>
            </div>
            <Switch id="feedback-toggle" checked={feedbackEnabled} onCheckedChange={setFeedbackEnabled} />
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

          <div className="rounded-md border p-3 bg-muted/40">
            <p className="text-xs text-muted-foreground">
              Podrás configurar alertas de desregulación una vez guardada la plantilla.
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || fields.length === 0 || createTemplate.isPending}
            className="w-full"
          >
            {createTemplate.isPending ? 'Creando...' : 'Crear plantilla'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

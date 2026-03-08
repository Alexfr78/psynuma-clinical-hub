import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  const { updateTemplate } = useAutoregistroTemplates();

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setFields([...template.fields]);
      setFeedbackEnabled(template.patient_feedback_enabled ?? false);
    }
  }, [template]);

  const handleSubmit = () => {
    if (!template || !name.trim() || fields.length === 0) return;
    if (fields.some((f) => !f.label.trim())) return;

    updateTemplate.mutate(
      { id: template.id, name: name.trim(), description: description.trim() || undefined, fields, patient_feedback_enabled: feedbackEnabled },
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
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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

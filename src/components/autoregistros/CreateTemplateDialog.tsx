import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichDescriptionEditor, sanitizeDescription } from './RichDescriptionEditor';
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
  const { createTemplate } = useAutoregistroTemplates();

  const handleSubmit = () => {
    if (!name.trim() || fields.length === 0) return;
    // Validate all fields have labels
    if (fields.some((f) => !f.label.trim())) return;

    createTemplate.mutate(
      { name: name.trim(), description: description.trim() || undefined, fields, patient_feedback_enabled: feedbackEnabled },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName('');
          setDescription('');
          setFields([]);
          setFeedbackEnabled(false);
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

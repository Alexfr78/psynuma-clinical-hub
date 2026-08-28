import { useState } from 'react';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConsentTemplates } from '@/hooks/useConsentTemplates';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/icon';

interface UploadConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  centerId: string;
  professionalId: string;
  onSuccess: () => void;
}

export function UploadConsentDialog({
  open,
  onOpenChange,
  patientId,
  centerId,
  professionalId,
  onSuccess,
}: UploadConsentDialogProps) {
  const { templates } = useConsentTemplates();
  const queryClient = useQueryClient();

  const [templateId, setTemplateId] = useState('');
  const [signedAt, setSignedAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const activeTemplates = templates.filter((t) => t.is_active);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(selected.type)) {
      toast.error('Formato no soportado. Usa PDF, JPG o PNG.');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10 MB.');
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async () => {
    if (!templateId || !file) {
      toast.error('Selecciona una plantilla y sube un archivo.');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload file to storage
      const ext = file.name.split('.').pop() || 'pdf';
      const filePath = `${centerId}/${patientId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('consent-documents')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      // 2. Get template content for snapshot
      const selectedTemplate = templates.find((t) => t.id === templateId);
      const contentSnapshot = selectedTemplate?.content_html || '';

      // 3. Create consent record
      const { error: insertError } = await supabase
        .from('consents')
        .insert({
          center_id: centerId,
          patient_id: patientId,
          template_id: templateId,
          professional_id: professionalId,
          status: 'signed',
          content_snapshot: contentSnapshot,
          requires_guardian: false,
          signed_at: new Date(signedAt).toISOString(),
          expires_at: new Date(signedAt).toISOString(), // not relevant for uploaded
          uploaded_file_url: filePath,
          source: 'uploaded',
        });

      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ['consents'] });
      toast.success('Consentimiento subido correctamente');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Error al subir el consentimiento');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setTemplateId('');
    setSignedAt(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir consentimiento firmado</DialogTitle>
          <DialogDescription>
            Sube un documento ya firmado en papel (PDF o imagen)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Template selector */}
          <div className="space-y-2">
            <Label>Plantilla de consentimiento</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar plantilla" />
              </SelectTrigger>
              <SelectContent>
                {activeTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Signed date */}
          <div className="space-y-2">
            <Label>Fecha de firma</Label>
            <Input
              type="date"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
            />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Documento firmado</Label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-6 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                  {file ? (
                    <div className="flex items-center gap-2">
                      <Icon name="description" className="h-4 w-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <Icon name="upload" className="h-5 w-5" />
                      <span>PDF, JPG o PNG (máx. 10 MB)</span>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre el documento..."
              rows={2}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={isUploading || !templateId || !file}
          >
            {isUploading ? (
              <>
                <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Icon name="upload" className="h-4 w-4 mr-2" />
                Guardar consentimiento
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

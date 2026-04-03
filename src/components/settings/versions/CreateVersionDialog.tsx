import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { AppChangeLog } from '@/hooks/useAppVersions';

export interface VersionVersionFormValues {
  version_code: string;
  version_name?: string;
  description?: string;
  applies_to_verifactu: boolean;
}

const schema = z.object({
  version_code: z.string().min(1, 'Código de versión obligatorio').max(50),
  version_name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  applies_to_verifactu: z.boolean(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChanges: AppChangeLog[];
  onSave: (data: VersionFormValues) => void;
}

export function CreateVersionDialog({ open, onOpenChange, selectedChanges, onSave }: Props) {
  const form = useForm<VersionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      version_code: '',
      version_name: '',
      description: '',
      applies_to_verifactu: selectedChanges.some((c) => c.affects_verifactu),
    },
  });

  const handleSubmit = (data: VersionFormValues) => {
    onSave(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear nueva versión</DialogTitle>
          <DialogDescription>
            Se incluirán {selectedChanges.length} cambio{selectedChanges.length !== 1 ? 's' : ''} seleccionado{selectedChanges.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 max-h-32 overflow-y-auto space-y-1 rounded border p-3 bg-muted/30">
          {selectedChanges.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs">{c.module}</Badge>
              <span className="truncate">{c.title}</span>
            </div>
          ))}
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código de versión *</Label>
              <Input {...form.register('version_code')} placeholder="ej: 1.4.0" />
              {form.formState.errors.version_code && (
                <p className="text-sm text-destructive">{form.formState.errors.version_code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nombre (opcional)</Label>
              <Input {...form.register('version_name')} placeholder="ej: Sprint 14" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea {...form.register('description')} rows={3} placeholder="Resumen de esta versión..." />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.watch('applies_to_verifactu')}
              onCheckedChange={(v) => form.setValue('applies_to_verifactu', v)}
            />
            <Label>Aplica a VeriFactu</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Crear versión</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

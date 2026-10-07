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
import { Icon } from '@/components/ui/icon';
import type { AppChangeLog } from '@/hooks/useAppVersions';

export interface VersionFormValues {
  version_code: string;
  version_name?: string;
  description?: string;
  applies_to_verifactu: boolean;
  /** Destacada: al publicarla sale una ventana. Normal: aviso breve y punto en Novedades. */
  highlight: boolean;
}

const schema = z.object({
  version_code: z.string().min(1, 'Código de versión obligatorio').max(50),
  version_name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  applies_to_verifactu: z.boolean(),
  highlight: z.boolean(),
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
      highlight: false,
    },
  });

  const visibleCount = selectedChanges.filter((c) => c.is_user_facing).length;

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
              {!c.is_user_facing && (
                <Icon name="visibility_off" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
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

          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.watch('highlight')}
                onCheckedChange={(v) => form.setValue('highlight', v)}
              />
              <Label>Versión destacada</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {visibleCount === 0
                ? 'Ningún cambio está marcado para el aviso: al publicarla no se avisará a nadie.'
                : form.watch('highlight')
                  ? `Al publicarla, los usuarios verán una ventana con ${visibleCount} cambio${visibleCount !== 1 ? 's' : ''}.`
                  : `Al publicarla, los usuarios verán un aviso breve y un punto en Novedades (${visibleCount} cambio${visibleCount !== 1 ? 's' : ''}).`}
            </p>
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

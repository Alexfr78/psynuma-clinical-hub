import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { AppChangeLog } from '@/hooks/useAppVersions';

const modules = [
  'agenda', 'pacientes', 'facturación', 'evaluaciones', 'autoregistros',
  'consentimientos', 'configuración', 'portal', 'verifactu', 'seguridad', 'otros',
];

const changeTypes = [
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Mejora' },
  { value: 'fix', label: 'Fix' },
  { value: 'technical', label: 'Técnico' },
  { value: 'legal', label: 'Legal' },
  { value: 'security', label: 'Seguridad' },
  { value: 'ui', label: 'UI' },
];

export interface ChangeFormValues {
  title: string;
  description?: string;
  module: string;
  change_type: string;
  affects_verifactu: boolean;
}

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio').max(200),
  description: z.string().max(2000).optional(),
  module: z.string().min(1, 'Módulo obligatorio'),
  change_type: z.string().min(1, 'Tipo obligatorio'),
  affects_verifactu: z.boolean(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingChange: AppChangeLog | null;
  onSave: (data: ChangeFormValues) => void;
}

export function CreateChangeDialog({ open, onOpenChange, editingChange, onSave }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      module: '',
      change_type: '',
      affects_verifactu: false,
    },
  });

  useEffect(() => {
    if (open) {
      if (editingChange) {
        form.reset({
          title: editingChange.title,
          description: editingChange.description || '',
          module: editingChange.module,
          change_type: editingChange.change_type,
          affects_verifactu: editingChange.affects_verifactu,
        });
      } else {
        form.reset({
          title: '',
          description: '',
          module: '',
          change_type: '',
          affects_verifactu: false,
        });
      }
    }
  }, [open, editingChange, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingChange ? 'Editar cambio' : 'Registrar cambio'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input {...form.register('title')} placeholder="Ej: Añadir campo teléfono en pacientes" />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea {...form.register('description')} placeholder="Detalles opcionales..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Módulo *</Label>
              <Select value={form.watch('module')} onValueChange={(v) => form.setValue('module', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={form.watch('change_type')} onValueChange={(v) => form.setValue('change_type', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {changeTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.watch('affects_verifactu')}
              onCheckedChange={(v) => form.setValue('affects_verifactu', v)}
            />
            <Label>Afecta VeriFactu</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">{editingChange ? 'Guardar' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

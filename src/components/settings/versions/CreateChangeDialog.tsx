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
  is_user_facing: boolean;
  user_summary?: string;
}

// Lo técnico y lo de seguridad no se anuncia a los usuarios salvo que se marque a mano.
const hiddenByDefault = (type: string) => type === 'technical' || type === 'security';

const schema = z.object({
  title: z.string().min(1, 'Título obligatorio').max(200),
  description: z.string().max(2000).optional(),
  module: z.string().min(1, 'Módulo obligatorio'),
  change_type: z.string().min(1, 'Tipo obligatorio'),
  affects_verifactu: z.boolean(),
  is_user_facing: z.boolean(),
  user_summary: z.string().max(500).optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingChange: AppChangeLog | null;
  onSave: (data: ChangeFormValues) => void;
  /** 'request': petición de un usuario que no es el dueño; sin campos de VeriFactu ni de aviso. */
  mode?: 'owner' | 'request';
}

export function CreateChangeDialog({ open, onOpenChange, editingChange, onSave, mode = 'owner' }: Props) {
  const isRequest = mode === 'request';
  const form = useForm<ChangeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      module: '',
      change_type: '',
      affects_verifactu: false,
      is_user_facing: true,
      user_summary: '',
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
          is_user_facing: editingChange.is_user_facing,
          user_summary: editingChange.user_summary || '',
        });
      } else {
        form.reset({
          title: '',
          description: '',
          module: '',
          change_type: '',
          affects_verifactu: false,
          is_user_facing: true,
          user_summary: '',
        });
      }
    }
  }, [open, editingChange, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRequest
              ? (editingChange ? 'Editar petición' : 'Nueva petición de cambio')
              : (editingChange ? 'Editar cambio' : 'Registrar cambio')}
          </DialogTitle>
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
              <Select
                value={form.watch('change_type')}
                onValueChange={(v) => {
                  form.setValue('change_type', v);
                  if (!editingChange) form.setValue('is_user_facing', !hiddenByDefault(v));
                }}
              >
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

          {!isRequest && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.watch('affects_verifactu')}
                  onCheckedChange={(v) => form.setValue('affects_verifactu', v)}
                />
                <Label>Afecta VeriFactu</Label>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.watch('is_user_facing')}
                    onCheckedChange={(v) => form.setValue('is_user_facing', v)}
                  />
                  <Label>Mostrar en el aviso de novedades</Label>
                </div>
                {form.watch('is_user_facing') && (
                  <div className="space-y-2">
                    <Label>Texto para los usuarios</Label>
                    <Textarea
                      {...form.register('user_summary')}
                      rows={2}
                      placeholder="Opcional. Si lo dejas vacío se muestra el título."
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">{editingChange ? 'Guardar' : isRequest ? 'Enviar petición' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

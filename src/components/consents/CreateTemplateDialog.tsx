import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, X } from 'lucide-react';
import { ConsentTemplate, useConsentTemplates } from '@/hooks/useConsentTemplates';
import { TemplateEditor } from './TemplateEditor';

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  content_html: z.string().min(10, 'El contenido es obligatorio'),
  requires_guardian_signature: z.boolean(),
  is_active: z.boolean(),
  verification_checkboxes: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ConsentTemplate;
}

const defaultContent = `<h2>Consentimiento Informado para Tratamiento Psicológico</h2>

<p>Yo, <strong>{nombre_paciente} {apellidos_paciente}</strong>, con DNI <strong>{dni_paciente}</strong>, declaro que:</p>

<ol>
  <li>He sido informado/a de forma clara y comprensible sobre la naturaleza del tratamiento psicológico que voy a recibir.</li>
  <li>He tenido la oportunidad de realizar las preguntas que he considerado oportunas, las cuales han sido respondidas satisfactoriamente.</li>
  <li>Entiendo que el tratamiento se basa en técnicas de evaluación e intervención psicológica.</li>
  <li>Comprendo que la información revelada durante las sesiones es confidencial y está protegida por el secreto profesional.</li>
  <li>He sido informado/a sobre mis derechos según el RGPD.</li>
</ol>

<p>Por todo ello, <strong>CONSIENTO</strong> de forma libre y voluntaria someterme al tratamiento propuesto.</p>

<p>En {nombre_centro}, a {fecha_actual}</p>`;

export function CreateTemplateDialog({
  open,
  onOpenChange,
  template,
}: CreateTemplateDialogProps) {
  const { createTemplate, updateTemplate } = useConsentTemplates();
  const isEditing = !!template;
  const [newCheckbox, setNewCheckbox] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      content_html: defaultContent,
      requires_guardian_signature: false,
      is_active: true,
      verification_checkboxes: [],
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        name: template.name,
        content_html: template.content_html,
        requires_guardian_signature: template.requires_guardian_signature,
        is_active: template.is_active,
        verification_checkboxes: template.verification_checkboxes || [],
      });
    } else {
      form.reset({
        name: '',
        content_html: defaultContent,
        requires_guardian_signature: false,
        is_active: true,
        verification_checkboxes: [],
      });
    }
  }, [template, form]);

  const addCheckbox = () => {
    if (newCheckbox.trim()) {
      const current = form.getValues('verification_checkboxes');
      form.setValue('verification_checkboxes', [...current, newCheckbox.trim()]);
      setNewCheckbox('');
    }
  };

  const removeCheckbox = (index: number) => {
    const current = form.getValues('verification_checkboxes');
    form.setValue('verification_checkboxes', current.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    if (isEditing) {
      await updateTemplate.mutateAsync({ id: template.id, ...values });
    } else {
      await createTemplate.mutateAsync({
        name: values.name,
        content_html: values.content_html,
        requires_guardian_signature: values.requires_guardian_signature,
        is_active: values.is_active,
        verification_checkboxes: values.verification_checkboxes,
      });
    }
    onOpenChange(false);
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar plantilla' : 'Nueva plantilla de consentimiento'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la plantilla</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Consentimiento Terapia Individual"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content_html"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenido del documento</FormLabel>
                  <FormControl>
                    <TemplateEditor value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Verification Checkboxes Section */}
            <div className="space-y-3">
              <FormLabel>Campos de verificación</FormLabel>
              <FormDescription className="text-xs">
                Añade checkboxes que el cliente deberá marcar al firmar el consentimiento
              </FormDescription>
              
              <div className="space-y-2">
                {form.watch('verification_checkboxes').map((checkbox, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                    <span className="flex-1 text-sm">{checkbox}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeCheckbox(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Ej: Acepto el tratamiento de mis datos personales"
                  value={newCheckbox}
                  onChange={(e) => setNewCheckbox(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCheckbox();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={addCheckbox}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <FormField
                control={form.control}
                name="requires_guardian_signature"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div>
                      <FormLabel className="cursor-pointer">
                        Requiere firma del tutor
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Forzar multi-firma aunque el paciente no sea menor
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">Plantilla activa</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

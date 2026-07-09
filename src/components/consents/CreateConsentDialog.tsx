import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, Users, Phone } from 'lucide-react';
import { useConsentTemplates } from '@/hooks/useConsentTemplates';
import { useConsents } from '@/hooks/useConsents';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { Patient } from '@/hooks/usePatients';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sanitizeHtml } from '@/lib/sanitize';

const schema = z.object({
  template_id: z.string().min(1, 'Selecciona una plantilla'),
});

type FormValues = z.infer<typeof schema>;

interface CreateConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  onSuccess?: (consentId: string) => void;
}

export function CreateConsentDialog({
  open,
  onOpenChange,
  patient,
  onSuccess,
}: CreateConsentDialogProps) {
  const { templates, isLoading: templatesLoading } = useConsentTemplates();
  const { createConsent } = useConsents(patient.id);
  const { center } = useCenter();
  const { profile } = useAuth();
  const [preview, setPreview] = useState<string>('');

  const activeTemplates = templates.filter((t) => t.is_active);
  const requiresGuardian = patient.is_minor || false;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      template_id: '',
    },
  });

  const selectedTemplateId = form.watch('template_id');
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Generate preview when template changes
  useEffect(() => {
    if (!selectedTemplate) {
      setPreview('');
      return;
    }

    let content = selectedTemplate.content_html;

    const replacements: Record<string, string> = {
      '{nombre_paciente}': patient.first_name,
      '{apellidos_paciente}': patient.last_name,
      '{dni_paciente}': patient.tax_id || '',
      '{fecha_nacimiento}': patient.date_of_birth
        ? format(new Date(patient.date_of_birth), 'd/MM/yyyy')
        : '',
      '{nombre_tutor}': patient.guardian_name || '',
      '{relacion_tutor}': patient.guardian_relationship || '',
      '{nombre_profesional}': profile?.first_name
        ? `${profile.first_name} ${profile.last_name || ''}`
        : '',
      '{especialidad}': profile?.specialty || '',
      '{nombre_centro}': center?.name || '',
      '{direccion_centro}': center?.address
        ? `${center.address}, ${center.city || ''}`
        : '',
      '{fecha_actual}': format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es }),
    };

    Object.entries(replacements).forEach(([key, value]) => {
      content = content.replace(new RegExp(key, 'g'), value);
    });

    setPreview(content);
  }, [selectedTemplate, patient, profile, center]);

  const onSubmit = async (values: FormValues) => {
    const result = await createConsent.mutateAsync({
      patient_id: patient.id,
      template_id: values.template_id,
      content_snapshot: preview,
      requires_guardian: requiresGuardian || (selectedTemplate?.requires_guardian_signature ?? false),
      emergency_contact_name: patient.emergency_contact_name,
      emergency_contact_phone: patient.emergency_contact_phone,
    });

    onOpenChange(false);
    onSuccess?.(result.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo consentimiento informado</DialogTitle>
        </DialogHeader>

        <div className="mb-4 rounded-lg bg-muted p-3">
          <p className="text-sm">
            <span className="font-medium">Contacto:</span> {patient.first_name} {patient.last_name}
          </p>
          {requiresGuardian && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                Contacto menor
              </Badge>
              <span className="text-xs text-muted-foreground">
                Requiere firma del tutor: {patient.guardian_name || 'No configurado'}
              </span>
            </div>
          )}
          {selectedTemplate?.requires_emergency_contact && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Phone className="h-3 w-3" />
                Contacto de emergencia
              </Badge>
              <span className="text-xs text-muted-foreground">
                Se precargará: {patient.emergency_contact_name || 'No configurado'}
                {patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ''}
              </span>
            </div>
          )}
        </div>

        {requiresGuardian && !patient.guardian_name && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Este contacto es menor pero no tiene un tutor configurado. 
              Por favor, actualiza los datos del contacto antes de crear el consentimiento.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="template_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plantilla de consentimiento</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={templatesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una plantilla" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {preview && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Vista previa del documento</p>
                <Card className="max-h-[300px] overflow-auto p-4">
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }}
                  />
                </Card>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createConsent.isPending || (requiresGuardian && !patient.guardian_name)}
              >
                {createConsent.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Crear y generar enlace
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

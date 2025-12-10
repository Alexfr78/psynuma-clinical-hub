import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDays, format } from 'date-fns';
import { CalendarIcon, Package, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePatients } from '@/hooks/usePatients';
import { useBonoTemplates, useCreateBono } from '@/hooks/useBonos';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un paciente'),
  template_id: z.string().optional(),
  name: z.string().min(1, 'El nombre es obligatorio'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sesión'),
  price_per_session: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  total_price: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  expires_at: z.date().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateBonoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
  onSuccess?: (bonoId: string) => void;
}

export function CreateBonoDialog({ open, onOpenChange, preselectedPatientId, onSuccess }: CreateBonoDialogProps) {
  const { data: patients } = usePatients();
  const { data: templates } = useBonoTemplates();
  const createBono = useCreateBono();
  const [isCustom, setIsCustom] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: preselectedPatientId || '',
      name: '',
      total_sessions: 10,
      price_per_session: 50,
      total_price: 500,
    },
  });

  useEffect(() => {
    if (preselectedPatientId) {
      form.setValue('patient_id', preselectedPatientId);
    }
  }, [preselectedPatientId, form]);

  const watchSessions = form.watch('total_sessions');
  const watchPricePerSession = form.watch('price_per_session');

  useEffect(() => {
    if (isCustom) {
      form.setValue('total_price', watchSessions * watchPricePerSession);
    }
  }, [watchSessions, watchPricePerSession, isCustom, form]);

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === 'custom') {
      setIsCustom(true);
      form.setValue('template_id', undefined);
      form.setValue('name', '');
      form.setValue('total_sessions', 10);
      form.setValue('price_per_session', 50);
      form.setValue('total_price', 500);
      form.setValue('expires_at', undefined);
    } else {
      setIsCustom(false);
      const template = templates?.find(t => t.id === templateId);
      if (template) {
        form.setValue('template_id', templateId);
        form.setValue('name', template.name);
        form.setValue('total_sessions', template.total_sessions);
        form.setValue('price_per_session', Number(template.price_per_session));
        form.setValue('total_price', Number(template.total_price));
        if (template.validity_days) {
          form.setValue('expires_at', addDays(new Date(), template.validity_days));
        }
      }
    }
  };

  const onSubmit = async (values: FormValues) => {
    const result = await createBono.mutateAsync({
      patient_id: values.patient_id,
      name: values.name,
      total_sessions: values.total_sessions,
      price_per_session: values.price_per_session,
      total_price: values.total_price,
      expires_at: values.expires_at?.toISOString() || null,
    });
    form.reset();
    onOpenChange(false);
    if (onSuccess && result?.id) {
      onSuccess(result.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Crear nuevo bono
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paciente</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar paciente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {patients?.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.first_name} {patient.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Plantilla</FormLabel>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plantilla o personalizar" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} - {template.total_sessions} sesiones ({Number(template.total_price).toFixed(2)}€)
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Personalizado
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormItem>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del bono</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ej: Bono 10 sesiones" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="total_sessions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sesiones</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_per_session"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>€/sesión</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="total_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total €</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} {...field} readOnly={!isCustom} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="expires_at"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de expiración (opcional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "d 'de' MMMM yyyy")
                          ) : (
                            <span>Sin fecha de expiración</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createBono.isPending}>
                {createBono.isPending ? 'Creando...' : 'Crear bono'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

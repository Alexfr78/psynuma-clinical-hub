import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Loader2 } from 'lucide-react';
import { validateSpanishTaxId } from '@/lib/nif-validation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerTrigger } from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useCreatePatient, useProfessionals } from '@/hooks/usePatients';

const patientSchema = z.object({
  first_name: z.string().min(1, 'El nombre es obligatorio').max(100),
  last_name: z.string().min(1, 'El apellido es obligatorio').max(100),
  email: z.string().email('Email inválido').max(255).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  gender: z.string().optional(),
  tax_id: z.string().max(20).optional().or(z.literal('')).refine(
    (val) => !val || validateSpanishTaxId(val).valid,
    (val) => ({ message: validateSpanishTaxId(val).message || 'NIF/NIE inválido' })
  ),
  address: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  postal_code: z.string().max(10).optional().or(z.literal('')),
  is_minor: z.boolean().default(false),
  guardian_name: z.string().max(200).optional().or(z.literal('')),
  guardian_phone: z.string().max(20).optional().or(z.literal('')),
  guardian_email: z.string().email('Email inválido').max(255).optional().or(z.literal('')),
  guardian_relationship: z.string().max(50).optional().or(z.literal('')),
  emergency_contact_name: z.string().max(200).optional().or(z.literal('')),
  emergency_contact_phone: z.string().max(20).optional().or(z.literal('')),
  assigned_professional_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

type PatientFormValues = z.infer<typeof patientSchema>;

export function CreatePatientDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const createPatient = useCreatePatient();
  const { data: professionals } = useProfessionals();

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      date_of_birth: '',
      gender: '',
      tax_id: '',
      address: '',
      city: '',
      postal_code: '',
      is_minor: false,
      guardian_name: '',
      guardian_phone: '',
      guardian_email: '',
      guardian_relationship: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      assigned_professional_id: null,
      notes: '',
    },
  });

  const isMinor = form.watch('is_minor');

  const onSubmit = async (values: PatientFormValues) => {
    try {
      await createPatient.mutateAsync({
        first_name: values.first_name,
        last_name: values.last_name,
        is_minor: values.is_minor,
        email: values.email || null,
        phone: values.phone || null,
        date_of_birth: values.date_of_birth || null,
        gender: values.gender || null,
        tax_id: values.tax_id || null,
        address: values.address || null,
        city: values.city || null,
        postal_code: values.postal_code || null,
        guardian_name: values.guardian_name || null,
        guardian_phone: values.guardian_phone || null,
        guardian_email: values.guardian_email || null,
        guardian_relationship: values.guardian_relationship || null,
        emergency_contact_name: values.emergency_contact_name || null,
        emergency_contact_phone: values.emergency_contact_phone || null,
        notes: values.notes || null,
      });

      toast({
        title: 'Contacto creado',
        description: `${values.first_name} ${values.last_name} ha sido registrado correctamente.`,
      });

      form.reset();
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el contacto. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const Wrapper = isMobile ? Drawer : Dialog;
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger;

  return (
    <Wrapper open={open} onOpenChange={setOpen}>
      <Trigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Contacto
        </Button>
      </Trigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nuevo Contacto</DialogTitle>
          <DialogDescription>
            Introduce los datos del contacto. Los campos marcados con * son obligatorios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Datos personales</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apellidos *</FormLabel>
                      <FormControl>
                        <Input placeholder="García López" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="juan@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input placeholder="+34 612 345 678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date_of_birth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de nacimiento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Género</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Masculino</SelectItem>
                          <SelectItem value="female">Femenino</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                          <SelectItem value="prefer_not_to_say">Prefiero no decir</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DNI/NIE</FormLabel>
                    <FormControl>
                      <Input placeholder="12345678A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Dirección</h4>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Calle Mayor, 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ciudad</FormLabel>
                      <FormControl>
                        <Input placeholder="Madrid" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código Postal</FormLabel>
                      <FormControl>
                        <Input placeholder="28001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Minor Support */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="is_minor"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Contacto menor de edad</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Activa esta opción si el contacto es menor y requiere tutor
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {isMinor && (
                <div className="space-y-4 rounded-lg border border-dashed p-4">
                  <h4 className="text-sm font-medium">Datos del tutor/responsable</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="guardian_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre completo</FormLabel>
                          <FormControl>
                            <Input placeholder="María García" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="guardian_relationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Relación</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="mother">Madre</SelectItem>
                              <SelectItem value="father">Padre</SelectItem>
                              <SelectItem value="guardian">Tutor legal</SelectItem>
                              <SelectItem value="other">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="guardian_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono</FormLabel>
                          <FormControl>
                            <Input placeholder="+34 612 345 678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="guardian_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="maria@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Contacto de emergencia</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergency_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre del contacto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergency_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input placeholder="+34 612 345 678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Professional Assignment */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">Asignación</h4>
              <FormField
                control={form.control}
                name="assigned_professional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profesional asignado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar profesional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {professionals?.map((prof) => (
                          <SelectItem key={prof.id} value={prof.id}>
                            {prof.first_name} {prof.last_name}
                            {prof.specialty && ` - ${prof.specialty}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observaciones adicionales..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPatient.isPending}>
                {createPatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Contacto
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

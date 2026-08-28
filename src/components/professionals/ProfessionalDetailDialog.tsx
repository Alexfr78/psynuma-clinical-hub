import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';

import {
  useProfessional,
  useUpdateProfessional,
  useProfessionalAvailability,
  useCreateAvailability,
  useDeleteAvailability,
  type Profile,
} from '@/hooks/useProfessionals';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

const profileSchema = z.object({
  first_name: z.string().min(1, 'El nombre es requerido'),
  last_name: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  specialty: z.string().optional(),
  license_number: z.string().optional(),
  commission_rate: z.coerce.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfessionalDetailDialogProps {
  professionalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export function ProfessionalDetailDialog({
  professionalId,
  open,
  onOpenChange,
}: ProfessionalDetailDialogProps) {
  const { data: professional, isLoading } = useProfessional(professionalId);
  const { data: availability = [] } = useProfessionalAvailability(professionalId);
  const updateProfessional = useUpdateProfessional();
  const createAvailability = useCreateAvailability();
  const deleteAvailability = useDeleteAvailability();

  const [newSlot, setNewSlot] = useState({
    day_of_week: 1,
    start_time: '09:00',
    end_time: '18:00',
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      specialty: '',
      license_number: '',
      commission_rate: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (professional) {
      form.reset({
        first_name: professional.first_name || '',
        last_name: professional.last_name || '',
        email: professional.email,
        phone: professional.phone || '',
        specialty: professional.specialty || '',
        license_number: professional.license_number || '',
        commission_rate: Number(professional.commission_rate) || 0,
        is_active: professional.is_active ?? true,
      });
    }
  }, [professional, form]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!professionalId) return;

    try {
      await updateProfessional.mutateAsync({
        id: professionalId,
        ...values,
      });
      toast.success('Profesional actualizado correctamente');
    } catch (error) {
      toast.error('Error al actualizar el profesional');
    }
  };

  const handleAddSlot = async () => {
    if (!professionalId) return;

    try {
      await createAvailability.mutateAsync({
        professional_id: professionalId,
        day_of_week: newSlot.day_of_week,
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
        is_available: true,
      });
      toast.success('Horario añadido');
    } catch (error) {
      toast.error('Error al añadir horario');
    }
  };

  const handleDeleteSlot = async (id: string) => {
    try {
      await deleteAvailability.mutateAsync(id);
      toast.success('Horario eliminado');
    } catch (error) {
      toast.error('Error al eliminar horario');
    }
  };

  const groupedAvailability = DAYS_OF_WEEK.map((day) => ({
    ...day,
    slots: availability.filter((slot) => slot.day_of_week === day.value),
  })).filter((day) => day.slots.length > 0);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {professional
              ? `${professional.first_name} ${professional.last_name}`
              : 'Profesional'}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger value="horarios">Horarios</TabsTrigger>
            </TabsList>

            <TabsContent value="datos" className="space-y-4 mt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre" {...field} />
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
                          <FormLabel>Apellidos</FormLabel>
                          <FormControl>
                            <Input placeholder="Apellidos" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="email@ejemplo.com" {...field} disabled />
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
                            <Input placeholder="600 000 000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="specialty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Especialidad</FormLabel>
                          <FormControl>
                            <Input placeholder="Psicología clínica" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="license_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nº Colegiado</FormLabel>
                          <FormControl>
                            <Input placeholder="M-12345" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="commission_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Comisión (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <FormLabel className="text-base">Activo</FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={updateProfessional.isPending}
                    className="w-full"
                  >
                    {updateProfessional.isPending && (
                      <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Guardar cambios
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="horarios" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Añadir horario</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Select
                      value={String(newSlot.day_of_week)}
                      onValueChange={(value) =>
                        setNewSlot({ ...newSlot, day_of_week: parseInt(value) })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Día" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={String(day.value)}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={newSlot.start_time}
                      onChange={(e) =>
                        setNewSlot({ ...newSlot, start_time: e.target.value })
                      }
                      className="w-[120px]"
                    />
                    <span className="flex items-center">a</span>
                    <Input
                      type="time"
                      value={newSlot.end_time}
                      onChange={(e) =>
                        setNewSlot({ ...newSlot, end_time: e.target.value })
                      }
                      className="w-[120px]"
                    />
                    <Button
                      onClick={handleAddSlot}
                      disabled={createAvailability.isPending}
                      size="icon"
                    >
                      {createAvailability.isPending ? (
                        <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon name="add" className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {groupedAvailability.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay horarios configurados
                  </p>
                ) : (
                  groupedAvailability.map((day) => (
                    <Card key={day.value}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium">
                          {day.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {day.slots.map((slot) => (
                            <div
                              key={slot.id}
                              className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
                            >
                              <span className="text-sm">
                                {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteSlot(slot.id)}
                              >
                                <Icon name="delete" className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

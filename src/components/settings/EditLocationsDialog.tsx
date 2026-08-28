import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useLocations, useCreateLocation, useDeleteLocation } from '@/hooks/useLocations';
import { Icon } from '@/components/ui/icon';

const locationSchema = z.object({
  country: z.string().max(200).default('España'),
  street: z.string().min(1, 'La calle es obligatoria').max(300),
  number_details: z.string().max(200).optional(),
  city: z.string().min(1, 'La ciudad es obligatoria').max(300),
  postal_code: z.string().max(20).optional(),
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
});

type LocationFormValues = z.infer<typeof locationSchema>;

interface EditLocationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditLocationsDialog({ open, onOpenChange }: EditLocationsDialogProps) {
  const { toast } = useToast();
  const { data: locations, isLoading } = useLocations();
  const createLocation = useCreateLocation();
  const deleteLocation = useDeleteLocation();
  const [showForm, setShowForm] = useState(false);

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      country: 'España',
      street: '',
      number_details: '',
      city: '',
      postal_code: '',
      name: '',
    },
  });

  const onSubmit = async (values: LocationFormValues) => {
    try {
      await createLocation.mutateAsync({
        name: values.name,
        street: values.street,
        city: values.city,
        number_details: values.number_details,
        postal_code: values.postal_code,
        country: values.country,
      });
      toast({ title: 'Dirección añadida' });
      form.reset();
      setShowForm(false);
    } catch {
      toast({ title: 'Error al añadir dirección', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLocation.mutateAsync(id);
      toast({ title: 'Dirección eliminada' });
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="location_on" className="h-5 w-5" />
            Editar direcciones
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new location form */}
          {showForm ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">Nueva dirección</p>
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre (ej: "Consulta Eguilaz")</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre de la ubicación" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>País</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="España">España</SelectItem>
                          <SelectItem value="Portugal">Portugal</SelectItem>
                          <SelectItem value="Francia">Francia</SelectItem>
                          <SelectItem value="Italia">Italia</SelectItem>
                          <SelectItem value="Alemania">Alemania</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Calle</FormLabel>
                        <FormControl>
                          <Input placeholder="Calle" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="number_details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número</FormLabel>
                        <FormControl>
                          <Input placeholder="Nº" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ciudad</FormLabel>
                        <FormControl>
                          <Input placeholder="Ciudad" {...field} />
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
                        <FormLabel>Código postal</FormLabel>
                        <FormControl>
                          <Input placeholder="CP" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createLocation.isPending}>
                    {createLocation.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
                    Añadir
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
              <Icon name="add" className="h-4 w-4 mr-2" />
              Añadir nueva dirección
            </Button>
          )}

          <Separator />

          {/* Existing locations */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Mis direcciones</p>
            
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Icon name="progress_activity" className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : locations && locations.length > 0 ? (
              <div className="space-y-2">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon name="location_on" className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{location.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {location.street} {location.number_details}, {location.city}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(location.id)}
                      disabled={deleteLocation.isPending}
                    >
                      <Icon name="delete" className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay direcciones guardadas
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

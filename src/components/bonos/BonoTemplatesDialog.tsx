import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings, Plus, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBonoTemplates, useCreateBonoTemplate, useDeleteBonoTemplate } from '@/hooks/useBonos';

const formSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sesión'),
  price_per_session: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  total_price: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  validity_days: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface BonoTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BonoTemplatesDialog({ open, onOpenChange }: BonoTemplatesDialogProps) {
  const { data: templates, isLoading } = useBonoTemplates();
  const createTemplate = useCreateBonoTemplate();
  const deleteTemplate = useDeleteBonoTemplate();
  const [showForm, setShowForm] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      total_sessions: 10,
      price_per_session: 50,
      total_price: 500,
      validity_days: 90,
    },
  });

  const watchSessions = form.watch('total_sessions');
  const watchPricePerSession = form.watch('price_per_session');

  // Auto-calculate total
  const calculatedTotal = watchSessions * watchPricePerSession;

  const onSubmit = async (values: FormValues) => {
    await createTemplate.mutateAsync({
      name: values.name,
      total_sessions: values.total_sessions,
      price_per_session: values.price_per_session,
      total_price: calculatedTotal,
      validity_days: values.validity_days || null,
    });
    form.reset();
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Gestionar plantillas de bonos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm && (
            <Button onClick={() => setShowForm(true)} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Nueva plantilla
            </Button>
          )}

          {showForm && (
            <Card>
              <CardContent className="pt-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ej: Bono 10 sesiones" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-4 gap-3">
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

                      <FormItem>
                        <FormLabel>Total €</FormLabel>
                        <Input type="number" value={calculatedTotal.toFixed(2)} readOnly className="bg-muted" />
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="validity_days"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Validez (días)</FormLabel>
                            <FormControl>
                              <Input type="number" min={0} {...field} placeholder="∞" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createTemplate.isPending}>
                        {createTemplate.isPending ? 'Guardando...' : 'Guardar plantilla'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Plantillas existentes</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : templates?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay plantillas creadas</p>
            ) : (
              <div className="space-y-2">
                {templates?.map((template) => (
                  <Card key={template.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {template.total_sessions} sesiones · {Number(template.price_per_session).toFixed(2)}€/sesión · 
                          Total: {Number(template.total_price).toFixed(2)}€
                          {template.validity_days && ` · ${template.validity_days} días`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template.id)}
                        disabled={deleteTemplate.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

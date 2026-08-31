import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Icon } from '@/components/ui/icon';

const centerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  tax_id: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  postal_code: z.string().max(10).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email inválido').max(255).optional().or(z.literal('')),
});

type CenterFormValues = z.infer<typeof centerSchema>;

export function CenterSetupWizard() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();

  const form = useForm<CenterFormValues>({
    resolver: zodResolver(centerSchema),
    defaultValues: {
      name: '',
      tax_id: '',
      address: '',
      city: '',
      postal_code: '',
      phone: '',
      email: '',
    },
  });

  const onSubmit = async (values: CenterFormValues) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data: centerId, error } = await supabase.rpc('bootstrap_create_center', {
        p_name: values.name,
        p_tax_id: values.tax_id || null,
        p_address: values.address || null,
        p_city: values.city || null,
        p_postal_code: values.postal_code || null,
        p_phone: values.phone || null,
        p_email: values.email || null,
      });

      if (error) throw error;
      if (!centerId) throw new Error('No se pudo crear el centro');

      toast({
        title: 'Centro configurado',
        description: 'Tu centro ha sido creado correctamente. ¡Ya puedes empezar!',
      });

      await refreshProfile();
    } catch (error: unknown) {
      console.error('Setup error:', error);
      const message = error instanceof Error ? error.message : '';
      toast({
        title: 'Error',
        description: message || 'No se pudo configurar el centro. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon name="apartment" className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">Configura tu centro</CardTitle>
          <CardDescription>
            Para empezar a usar Psycma, necesitas configurar los datos de tu centro o consulta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del centro *</FormLabel>
                    <FormControl>
                      <Input placeholder="Centro de Psicología Ejemplo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tax_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIF/CIF</FormLabel>
                      <FormControl>
                        <Input placeholder="B12345678" {...field} />
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
                        <Input placeholder="+34 912 345 678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email del centro</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@centro.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Calle Principal, 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
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

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icon name="check_circle" className="mr-2 h-4 w-4" />
                )}
                Crear Centro y Empezar
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

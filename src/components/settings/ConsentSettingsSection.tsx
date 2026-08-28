import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCenter } from '@/hooks/useCenter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

import { useEffect } from 'react';
import { Icon } from '@/components/ui/icon';

const schema = z.object({
  consent_expiration_days: z.coerce
    .number()
    .min(1, 'Mínimo 1 día')
    .max(90, 'Máximo 90 días'),
});

type FormValues = z.infer<typeof schema>;

export function ConsentSettingsSection() {
  const { center, updateCenter, isLoading } = useCenter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      consent_expiration_days: 7,
    },
  });

  useEffect(() => {
    if (center) {
      form.reset({
        consent_expiration_days: center.consent_expiration_days || 7,
      });
    }
  }, [center, form]);

  const onSubmit = async (values: FormValues) => {
    await updateCenter.mutateAsync(values);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consentimientos Informados</CardTitle>
        <CardDescription>
          Configura las opciones para los consentimientos informados
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="consent_expiration_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Días de expiración del enlace</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      className="w-32"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Número de días que el enlace de firma permanecerá activo (1-90 días)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={updateCenter.isPending}>
              {updateCenter.isPending && (
                <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar cambios
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

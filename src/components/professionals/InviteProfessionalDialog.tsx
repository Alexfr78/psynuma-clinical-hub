import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useInviteProfessional } from '@/hooks/useProfessionals';

const inviteProfessionalSchema = z.object({
  first_name: z.string().trim().min(1, 'Introduce el nombre').max(100, 'Máximo 100 caracteres'),
  last_name: z.string().trim().min(1, 'Introduce los apellidos').max(100, 'Máximo 100 caracteres'),
  email: z.string().trim().email('Introduce un email válido').max(255, 'Máximo 255 caracteres'),
});

type InviteProfessionalValues = z.infer<typeof inviteProfessionalSchema>;

interface InviteProfessionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultValues: InviteProfessionalValues = {
  first_name: '',
  last_name: '',
  email: '',
};

export function InviteProfessionalDialog({
  open,
  onOpenChange,
}: InviteProfessionalDialogProps) {
  const inviteProfessional = useInviteProfessional();
  const form = useForm<InviteProfessionalValues>({
    resolver: zodResolver(inviteProfessionalSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
    }
  }, [form, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!inviteProfessional.isPending) {
      onOpenChange(nextOpen);
    }
  };

  const onSubmit = async (values: InviteProfessionalValues) => {
    try {
      await inviteProfessional.mutateAsync(values);
      toast.success(`Invitación enviada a ${values.email.trim().toLowerCase()}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar la invitación. Inténtalo de nuevo',
      );
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <MailPlus className="h-5 w-5" aria-hidden="true" />
            Invitar profesional
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Recibirá un email para crear su acceso. Se incorporará al centro como profesional,
            sin permisos de administración.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input autoComplete="given-name" placeholder="Nombre" {...field} />
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
                      <Input autoComplete="family-name" placeholder="Apellidos" {...field} />
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
                  <FormLabel>Email profesional</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="profesional@ejemplo.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ResponsiveDialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={inviteProfessional.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={inviteProfessional.isPending}>
                {inviteProfessional.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MailPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {inviteProfessional.isPending ? 'Enviando…' : 'Enviar invitación'}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

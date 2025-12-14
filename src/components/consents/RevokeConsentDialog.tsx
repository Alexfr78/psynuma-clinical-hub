import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Consent, useConsents } from '@/hooks/useConsents';

const schema = z.object({
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres'),
});

type FormValues = z.infer<typeof schema>;

interface RevokeConsentDialogProps {
  consent: Consent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevokeConsentDialog({
  consent,
  open,
  onOpenChange,
}: RevokeConsentDialogProps) {
  const { revokeConsent } = useConsents();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    await revokeConsent.mutateAsync({
      id: consent.id,
      reason: values.reason,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Revocar consentimiento
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción marcará el consentimiento como revocado. El documento
            original permanecerá archivado para fines legales.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de la revocación *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe el motivo de la revocación..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={revokeConsent.isPending}
              >
                {revokeConsent.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Revocar consentimiento
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

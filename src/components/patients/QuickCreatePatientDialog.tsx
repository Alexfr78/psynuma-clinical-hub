import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCreatePatient } from '@/hooks/usePatients';
import { useProfessionals } from '@/hooks/usePatients';

const quickPatientSchema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio'),
  assigned_professional_id: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type QuickPatientFormValues = z.infer<typeof quickPatientSchema>;

interface QuickCreatePatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatientCreated: (patientId: string) => void;
  initialName?: string;
  defaultProfessionalId?: string;
}

export function QuickCreatePatientDialog({
  open,
  onOpenChange,
  onPatientCreated,
  initialName = '',
  defaultProfessionalId,
}: QuickCreatePatientDialogProps) {
  const { toast } = useToast();
  const createPatient = useCreatePatient();
  const { data: professionals } = useProfessionals();
  const [countryCode, setCountryCode] = useState('+34');

  const form = useForm<QuickPatientFormValues>({
    resolver: zodResolver(quickPatientSchema),
    defaultValues: {
      full_name: initialName,
      assigned_professional_id: defaultProfessionalId || '',
      email: '',
      phone: '',
    },
  });

  // Reset form when dialog opens with new initial values
  useEffect(() => {
    if (open) {
      form.reset({
        full_name: initialName,
        assigned_professional_id: defaultProfessionalId || '',
        email: '',
        phone: '',
      });
    }
  }, [open, initialName, defaultProfessionalId, form]);

  const parseFullName = (fullName: string) => {
    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { first_name: parts[0], last_name: '' };
    }
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(' '),
    };
  };

  const onSubmit = async (values: QuickPatientFormValues) => {
    try {
      const { first_name, last_name } = parseFullName(values.full_name);
      
      const patientData = {
        first_name,
        last_name,
        email: values.email || null,
        phone: values.phone ? `${countryCode}${values.phone}` : null,
        assigned_professional_id: values.assigned_professional_id || null,
        status: 'active' as const,
      };

      const newPatient = await createPatient.mutateAsync(patientData);

      toast({
        title: 'Contacto creado',
        description: `${first_name} ${last_name} se ha añadido correctamente.`,
      });

      onPatientCreated(newPatient.id);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el contacto.',
        variant: 'destructive',
      });
    }
  };

  const selectedProfessional = professionals?.find(
    (p) => p.id === form.watch('assigned_professional_id')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            Nueva ficha de contacto
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-6 pb-6">
            {/* Professional */}
            <FormField
              control={form.control}
              name="assigned_professional_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Profesional</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Seleccionar profesional">
                          {selectedProfessional && (
                            <span className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-3 w-3 text-primary" />
                              </div>
                              {selectedProfessional.first_name} {selectedProfessional.last_name}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {professionals?.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          <span className="flex items-center gap-2">
                            {prof.first_name} {prof.last_name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contact Name */}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Nombre del contacto
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nombre completo"
                      className="h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Email <span className="text-muted-foreground">(Opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@ejemplo.com"
                      className="h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone with country code */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Teléfono <span className="text-muted-foreground">(Opcional)</span>
                  </FormLabel>
                  <div className="flex gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-24 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+34">🇪🇸 +34</SelectItem>
                        <SelectItem value="+33">🇫🇷 +33</SelectItem>
                        <SelectItem value="+44">🇬🇧 +44</SelectItem>
                        <SelectItem value="+49">🇩🇪 +49</SelectItem>
                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                        <SelectItem value="+52">🇲🇽 +52</SelectItem>
                        <SelectItem value="+54">🇦🇷 +54</SelectItem>
                        <SelectItem value="+56">🇨🇱 +56</SelectItem>
                        <SelectItem value="+57">🇨🇴 +57</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormControl>
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="612 345 678"
                          className="h-10 pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createPatient.isPending}>
                Crear contacto
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

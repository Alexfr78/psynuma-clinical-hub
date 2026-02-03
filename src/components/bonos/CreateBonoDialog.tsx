import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDays, format } from 'date-fns';
import { CalendarIcon, Package, Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePatients } from '@/hooks/usePatients';
import { useBonoTemplates, useCreateBono } from '@/hooks/useBonos';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { useIssueInvoice } from '@/hooks/useIssueInvoice';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SendInvoiceDialog } from '@/components/invoices/SendInvoiceDialog';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un paciente'),
  template_id: z.string().optional(),
  name: z.string().min(1, 'El nombre es obligatorio'),
  total_sessions: z.coerce.number().min(1, 'Mínimo 1 sesión'),
  price_per_session: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  total_price: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  expires_at: z.date().optional(),
  // Payment fields
  pay_now: z.boolean().default(false),
  payment_amount: z.coerce.number().optional(),
  payment_method: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateBonoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
  onSuccess?: (bonoId: string, totalPrice: number) => void;
}

export function CreateBonoDialog({ open, onOpenChange, preselectedPatientId, onSuccess }: CreateBonoDialogProps) {
  const { data: patients } = usePatients();
  const { data: templates } = useBonoTemplates();
  const createBono = useCreateBono();
  const createSignedInvoice = useCreateSignedInvoice();
  const issueInvoice = useIssueInvoice();
  const { profile } = useAuth();
  const { center } = useCenter();
  const [isCustom, setIsCustom] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSendInvoiceDialog, setShowSendInvoiceDialog] = useState(false);
  const [createdInvoiceForSend, setCreatedInvoiceForSend] = useState<{
    id: string;
    invoice_number: string;
    total: number;
    patients: {
      id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
      phone?: string | null;
    };
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: preselectedPatientId || '',
      name: '',
      total_sessions: 10,
      price_per_session: 50,
      total_price: 500,
      pay_now: false,
      payment_method: 'cash',
    },
  });

  useEffect(() => {
    if (preselectedPatientId) {
      form.setValue('patient_id', preselectedPatientId);
    }
  }, [preselectedPatientId, form]);

  const watchSessions = form.watch('total_sessions');
  const watchPricePerSession = form.watch('price_per_session');
  const watchPayNow = form.watch('pay_now');
  const watchTotalPrice = form.watch('total_price');

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
    const centerId = profile?.center_id;
    if (!centerId) {
      toast.error('Error: No hay centro configurado. Por favor, recarga la página.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Create the bono
      const result = await createBono.mutateAsync({
        patient_id: values.patient_id,
        name: values.name,
        total_sessions: values.total_sessions,
        price_per_session: values.price_per_session,
        total_price: values.total_price,
        expires_at: values.expires_at?.toISOString() || null,
      });

      if (result?.id && values.total_price > 0) {
        // 2. FIRST: Create debt linked to bono (this MUST succeed before invoice)
        // This ensures even if invoice creation fails, the bono has a debt
        const { data: debtData, error: debtError } = await supabase
          .from('debts')
          .insert({
            patient_id: values.patient_id,
            bono_id: result.id,
            amount: values.total_price,
            paid_amount: 0,
            status: 'pending',
            notes: `Bono: ${values.name} (${values.total_sessions} sesiones)`,
            center_id: centerId,
          })
          .select('id')
          .single();

        if (debtError) {
          console.error('Error creating debt:', debtError);
          throw new Error('No se pudo crear la deuda del bono');
        }

        // 3. Create DRAFT invoice and link to debt
        let invoiceId: string | null = null;
        try {
          const invoiceResult = await createSignedInvoice.mutateAsync({
            patientId: values.patient_id,
            invoiceType: 'simplified',
            bonoId: result.id,
            statusOverride: 'draft',
            items: [{
              description: `Bono: ${values.name} (${values.total_sessions} sesiones)`,
              quantity: 1,
              unit_price: values.total_price,
              tax_rate: 0,
              tax_amount: 0,
              total: values.total_price,
              bono_id: result.id,
            }],
            notes: `Bono: ${values.name} (Exento de IVA)`,
            sendNotification: false,
          });

          invoiceId = invoiceResult?.invoiceId || null;

          // Link invoice to debt
          if (invoiceId) {
            await supabase
              .from('debts')
              .update({ invoice_id: invoiceId })
              .eq('id', debtData.id);
          }
        } catch (invoiceError) {
          console.error('Error creating invoice:', invoiceError);
          // Invoice failed but bono and debt exist - show warning
          toast.warning('Bono creado pero hubo un error al crear la factura. Puedes crearla manualmente.');
        }

        // 4. If paying now, record payment and issue invoice
        const paidAmount = values.pay_now ? (values.payment_amount || values.total_price) : 0;
        
        if (values.pay_now && paidAmount > 0 && invoiceId) {
          // Record payment against the invoice
          const { error: paymentError } = await supabase.from('payments').insert({
            patient_id: values.patient_id,
            amount: paidAmount,
            payment_method: values.payment_method || 'cash',
            payment_date: new Date().toISOString(),
            center_id: centerId,
            invoice_id: invoiceId,
          });

          if (paymentError) {
            console.error('Error creating payment:', paymentError);
            toast.warning('Bono creado pero hubo un error al registrar el pago');
          } else {
            // Recompute debt via RPC
            await supabase.rpc('recompute_debt_by_invoice', { p_debt_id: debtData.id });

            // Issue the invoice (draft → issued + Verifactu)
            try {
              const issueResult = await issueInvoice.mutateAsync(invoiceId);

              // If fully paid, update invoice status to 'paid'
              if (paidAmount >= values.total_price) {
                await supabase
                  .from('invoices')
                  .update({ status: 'paid' })
                  .eq('id', invoiceId);
              }

              toast.success('Bono creado, factura emitida y pago registrado');

              // Get patient details for send dialog
              const patient = patients?.find(p => p.id === values.patient_id);
              if (patient && issueResult.invoiceNumber) {
                setCreatedInvoiceForSend({
                  id: invoiceId,
                  invoice_number: issueResult.invoiceNumber,
                  total: values.total_price,
                  patients: {
                    id: patient.id,
                    first_name: patient.first_name,
                    last_name: patient.last_name,
                    email: patient.email,
                    phone: patient.phone,
                  },
                });
                setTimeout(() => setShowSendInvoiceDialog(true), 100);
              }
            } catch (issueError) {
              console.error('Error issuing invoice:', issueError);
              toast.warning('Bono y pago registrados, pero la factura quedó en borrador');
            }
          }
        } else if (values.pay_now && paidAmount > 0 && !invoiceId) {
          // Pay without invoice - just update debt
          const { error: paymentError } = await supabase.from('payments').insert({
            patient_id: values.patient_id,
            amount: paidAmount,
            payment_method: values.payment_method || 'cash',
            payment_date: new Date().toISOString(),
            center_id: centerId,
          });

          if (!paymentError) {
            await supabase
              .from('debts')
              .update({ 
                paid_amount: paidAmount,
                status: paidAmount >= values.total_price ? 'paid' : 'partial'
              })
              .eq('id', debtData.id);
            toast.success('Bono creado y pago registrado (sin factura)');
          }
        } else {
          toast.success(invoiceId ? 'Bono creado con factura borrador' : 'Bono creado');
        }
      } else if (result?.id) {
        // Bono with price 0
        toast.success('Bono creado');
      }

      const totalPrice = values.total_price;
      form.reset();
      onOpenChange(false);
      if (onSuccess && result?.id) {
        onSuccess(result.id, totalPrice);
      }
    } catch (error) {
      console.error('Error creating bono:', error);
      toast.error(error instanceof Error ? error.message : 'Error al crear el bono');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMobile = useIsMobile();

  const formContent = (
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
                <SelectContent className="z-[200]" position="popper" sideOffset={4}>
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
            <SelectContent className="z-[200]" position="popper" sideOffset={4}>
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
                        !field.value && "text-muted-foreground",
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
                <PopoverContent
                  className="w-auto p-0 z-[200]"
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
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

        <Separator className="my-4" />

        {/* Payment section */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="pay_now"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal cursor-pointer">Registrar pago ahora</FormLabel>
              </FormItem>
            )}
          />

          {watchPayNow && (
            <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-muted">
              <FormField
                control={form.control}
                name="payment_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importe pagado (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        placeholder={String(watchTotalPrice || 0)}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[200]" position="popper" sideOffset={4}>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                        <SelectItem value="bizum">Bizum</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || createBono.isPending}>
            {isSubmitting ? 'Creando...' : 'Crear bono'}
          </Button>
        </div>
      </form>
    </Form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95vh] max-h-[95vh] overflow-hidden">
          <DrawerHeader className="px-4 pt-4 pb-2 border-b">
            <div className="flex items-center justify-between gap-3">
              <DrawerTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Crear nuevo bono
              </DrawerTitle>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Crear nuevo bono
            </DialogTitle>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>

      <SendInvoiceDialog
        open={showSendInvoiceDialog}
        onOpenChange={setShowSendInvoiceDialog}
        invoice={createdInvoiceForSend}
      />
    </>
  );
}

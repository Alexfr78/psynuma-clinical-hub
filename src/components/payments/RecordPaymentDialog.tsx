import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, CreditCard, Check, ChevronsUpDown, AlertTriangle } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { usePatients } from '@/hooks/usePatients';
import { useCreatePayment } from '@/hooks/usePayments';
import { useInvoices } from '@/hooks/useInvoices';
import { useCollectDebtPayment } from '@/hooks/useCollectDebtPayment';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un paciente'),
  invoice_id: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'El importe debe ser mayor a 0'),
  payment_date: z.date(),
  payment_method: z.string().min(1, 'Selecciona un método de pago'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  generate_invoice: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedDebtId?: string;
  preselectedPatientId?: string;
  preselectedInvoiceId?: string;
  preselectedAmount?: number;
  preselectedDescription?: string;
  onInvoiceCreated?: (invoiceId: string) => void;
}

const paymentMethods = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'bizum', label: 'Bizum' },
];

export function RecordPaymentDialog({ 
  open, 
  onOpenChange, 
  preselectedDebtId,
  preselectedPatientId,
  preselectedInvoiceId,
  preselectedAmount,
  preselectedDescription,
  onInvoiceCreated,
}: RecordPaymentDialogProps) {
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState<{
    hasInvoice: boolean;
    bonoId: string | null;
    bonoName: string | null;
    sessionId: string | null;
    sessionDate: string | null;
    sessionType: string | null;
    sessionPrice: number | null;
  } | null>(null);
  
  const { data: patients } = usePatients({ search: patientSearch || undefined });
  const { data: invoices } = useInvoices({ status: 'issued' });
  const createPayment = useCreatePayment();
  const collectDebtPayment = useCollectDebtPayment();
  const createSignedInvoice = useCreateSignedInvoice();
  
  const isDebtPayment = !!preselectedDebtId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: '',
      invoice_id: '',
      amount: 0,
      payment_date: new Date(),
      payment_method: 'cash',
      reference: '',
      notes: '',
      generate_invoice: true,
    },
  });

  // Reset and sync form values when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        patient_id: preselectedPatientId || '',
        invoice_id: preselectedInvoiceId || '',
        amount: preselectedAmount || 0,
        payment_date: new Date(),
        payment_method: 'cash',
        reference: '',
        notes: '',
        generate_invoice: true,
      });
      setDebtInfo(null);
    }
  }, [open, preselectedPatientId, preselectedInvoiceId, preselectedAmount]);

  // Fetch debt details including invoice status
  useEffect(() => {
    if (!open || !preselectedDebtId) {
      setDebtInfo(null);
      return;
    }

    let cancelled = false;

    const fetchDebtDetails = async () => {
      const { data, error } = await supabase
        .from("debts")
        .select(`
          patient_id,
          invoice_id,
          bono_id,
          session_id,
          bonos (id, name, total_sessions, total_price),
          sessions (id, session_date, start_time, session_type, price)
        `)
        .eq("id", preselectedDebtId)
        .single();

      if (cancelled || error || !data) return;
      
      if (!preselectedPatientId) {
        form.setValue("patient_id", data.patient_id, { shouldValidate: true });
      }
      
      const sessionData = data.sessions as any;
      setDebtInfo({
        hasInvoice: !!data.invoice_id,
        bonoId: data.bono_id,
        bonoName: (data.bonos as any)?.name || null,
        sessionId: data.session_id,
        sessionDate: sessionData?.session_date || null,
        sessionType: sessionData?.session_type || null,
        sessionPrice: sessionData?.price != null ? Number(sessionData.price) : null,
      });
    };

    fetchDebtDetails();

    return () => {
      cancelled = true;
    };
  }, [open, preselectedDebtId, preselectedPatientId]);

  const watchPatientId = form.watch('patient_id');
  const watchGenerateInvoice = form.watch('generate_invoice');
  const selectedPatient = patients?.find(p => p.id === watchPatientId);
  const patientInvoices = invoices?.filter(inv => inv.patient_id === watchPatientId) || [];

  // Show invoice option for debts without invoice (both bono and session debts)
  const showInvoiceOption = isDebtPayment && debtInfo && !debtInfo.hasInvoice;

  const onSubmit = async (values: FormValues) => {
    if (preselectedDebtId) {
      // Check if we need to create an invoice first
      let invoiceIdToUse: string | undefined = undefined;
      
      if (showInvoiceOption && values.generate_invoice) {
        try {
          let items: Array<{
            description: string;
            quantity: number;
            unit_price: number;
            tax_rate: number;
            tax_amount: number;
            total: number;
            session_id?: string;
            bono_id?: string;
          }>;
          let invoiceNotes: string;

          if (debtInfo?.bonoId) {
            // Bono invoice
            items = [{
              description: `Bono: ${debtInfo.bonoName || 'Bono de sesiones'}`,
              quantity: 1,
              unit_price: preselectedAmount || values.amount,
              tax_rate: 0,
              tax_amount: 0,
              total: preselectedAmount || values.amount,
              bono_id: debtInfo.bonoId,
            }];
            invoiceNotes = `Bono: ${debtInfo.bonoName || 'Bono de sesiones'} (Exento de IVA)`;
          } else {
            // Session invoice
            const sessionDesc = debtInfo?.sessionType
              ? `Sesión de ${debtInfo.sessionType}`
              : 'Sesión de psicoterapia';
            const dateStr = debtInfo?.sessionDate
              ? ` - ${format(new Date(debtInfo.sessionDate), "d 'de' MMMM yyyy")}`
              : '';
            items = [{
              description: `${sessionDesc}${dateStr}`,
              quantity: 1,
              unit_price: preselectedAmount || values.amount,
              tax_rate: 0,
              tax_amount: 0,
              total: preselectedAmount || values.amount,
              session_id: debtInfo?.sessionId || undefined,
            }];
            invoiceNotes = 'Factura generada al registrar pago';
          }

          const invoiceResult = await createSignedInvoice.mutateAsync({
            patientId: values.patient_id,
            invoiceType: 'simplified',
            bonoId: debtInfo?.bonoId || undefined,
            statusOverride: 'draft',
            items,
            notes: invoiceNotes,
            sendNotification: false,
          });
          
          invoiceIdToUse = invoiceResult?.invoiceId;
          
          if (invoiceIdToUse) {
            // Link invoice to debt
            await supabase
              .from('debts')
              .update({ invoice_id: invoiceIdToUse })
              .eq('id', preselectedDebtId);
          }
        } catch (error) {
          console.error('Error creating invoice:', error);
          toast.warning('No se pudo crear la factura, pero se registrará el pago');
        }
      }
      
      // Collect debt payment
      await collectDebtPayment.mutateAsync({
        debtId: preselectedDebtId,
        amount: values.amount,
        paymentMethod: values.payment_method,
        reference: values.reference || null,
        notes: values.notes || null,
        invoiceId: invoiceIdToUse,
      });
    } else {
      // Simple payment (no invoice generation)
      await createPayment.mutateAsync({
        patient_id: values.patient_id,
        invoice_id: values.invoice_id || null,
        amount: values.amount,
        payment_date: format(values.payment_date, 'yyyy-MM-dd'),
        payment_method: values.payment_method,
        reference: values.reference || null,
        notes: values.notes || null,
      });
    }
    form.reset();
    onOpenChange(false);
  };
  
  const isPending = createPayment.isPending || collectDebtPayment.isPending || createSignedInvoice.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Registrar pago
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isDebtPayment && preselectedDescription && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Concepto:</span> {preselectedDescription}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Contacto</FormLabel>
                  <Popover open={patientPopoverOpen} onOpenChange={setPatientPopoverOpen} modal={false}>
                    <PopoverTrigger asChild disabled={isDebtPayment}>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={patientPopoverOpen}
                          className={cn(
                            "w-full justify-between font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isDebtPayment}
                        >
                          {selectedPatient
                            ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                            : isDebtPayment
                            ? "Cargando paciente..."
                            : "Buscar paciente..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999] pointer-events-auto" align="start" data-vaul-no-drag>
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar por nombre..."
                          value={patientSearch}
                          onValueChange={setPatientSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No se encontraron pacientes</CommandEmpty>
                          <CommandGroup>
                            {patients?.map((patient) => (
                              <CommandItem
                                key={patient.id}
                                value={patient.id}
                                onSelect={() => {
                                  field.onChange(patient.id);
                                  setPatientPopoverOpen(false);
                                  setPatientSearch('');
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === patient.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{patient.first_name} {patient.last_name}</span>
                                  {patient.email && (
                                    <span className="text-xs text-muted-foreground">{patient.email}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isDebtPayment && watchPatientId && patientInvoices.length > 0 && (
              <FormField
                control={form.control}
                name="invoice_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Factura (opcional)</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || '__none__'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Asociar a factura" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Sin factura asociada</SelectItem>
                        {patientInvoices.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            {invoice.invoice_number} - {Number(invoice.total).toFixed(2)}€
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Show invoice generation option for debts without invoice */}
            {showInvoiceOption && (
              <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <div className="space-y-2">
                    <p className="text-sm">
                      Esta deuda{debtInfo?.bonoName ? ` (${debtInfo.bonoName})` : ''} no tiene factura asociada.
                    </p>
                    <FormField
                      control={form.control}
                      name="generate_invoice"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-amber-800 dark:text-amber-200">
                            Generar factura al registrar el pago
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importe (€)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0.01} {...field} />
                    </FormControl>
                    <FormMessage />
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
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de pago</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? format(field.value, "d 'de' MMMM yyyy") : <span>Seleccionar fecha</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ej: Nº de transferencia" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Registrando...' : isDebtPayment ? (watchGenerateInvoice && showInvoiceOption ? 'Cobrar y facturar' : 'Registrar cobro') : 'Registrar pago'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

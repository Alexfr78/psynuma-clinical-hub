import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, CreditCard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { usePatients } from '@/hooks/usePatients';
import { useCreatePayment } from '@/hooks/usePayments';
import { useInvoices } from '@/hooks/useInvoices';
import { useCollectDebtPayment } from '@/hooks/useCollectDebtPayment';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText } from 'lucide-react';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un paciente'),
  invoice_id: z.string().optional(),
  amount: z.coerce.number().min(0.01, 'El importe debe ser mayor a 0'),
  payment_date: z.date(),
  payment_method: z.string().min(1, 'Selecciona un método de pago'),
  reference: z.string().optional(),
  notes: z.string().optional(),
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
}: RecordPaymentDialogProps) {
  const { data: patients } = usePatients();
  const { data: invoices } = useInvoices({ status: 'issued' });
  const createPayment = useCreatePayment();
  const collectDebtPayment = useCollectDebtPayment();
  
  const isDebtPayment = !!preselectedDebtId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: preselectedPatientId || '',
      invoice_id: preselectedInvoiceId || '',
      amount: preselectedAmount || 0,
      payment_date: new Date(),
      payment_method: 'cash',
      reference: '',
      notes: '',
    },
  });

  const watchPatientId = form.watch('patient_id');
  const patientInvoices = invoices?.filter(inv => inv.patient_id === watchPatientId) || [];

  const onSubmit = async (values: FormValues) => {
    if (preselectedDebtId) {
      // Collect debt: creates invoice + payment + updates debt
      await collectDebtPayment.mutateAsync({
        debtId: preselectedDebtId,
        amount: values.amount,
        paymentMethod: values.payment_method,
        reference: values.reference || null,
        notes: values.notes || null,
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
  
  const isPending = createPayment.isPending || collectDebtPayment.isPending;

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
                <FormItem>
                  <FormLabel>Paciente</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={isDebtPayment}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar paciente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
                {isPending ? 'Registrando...' : isDebtPayment ? 'Cobrar y facturar' : 'Registrar pago'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, FileText } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { usePatients } from '@/hooks/usePatients';
import { useCreateInvoice, useUnbilledSessions } from '@/hooks/useInvoices';

const formSchema = z.object({
  patient_id: z.string().min(1, 'Selecciona un contacto'),
  issue_date: z.date(),
  tax_rate: z.coerce.number().min(0).max(100),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateRecapInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRecapInvoiceDialog({ open, onOpenChange }: CreateRecapInvoiceDialogProps) {
  const { data: patients } = usePatients();
  const createInvoice = useCreateInvoice();
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);

  const { data: unbilledSessions } = useUnbilledSessions(selectedPatient || undefined);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: '',
      issue_date: new Date(),
      tax_rate: 21,
      notes: '',
    },
  });

  useEffect(() => {
    setSelectedSessions([]);
  }, [selectedPatient]);

  const handlePatientChange = (patientId: string) => {
    setSelectedPatient(patientId);
    form.setValue('patient_id', patientId);
  };

  const toggleSession = (sessionId: string) => {
    setSelectedSessions(prev =>
      prev.includes(sessionId)
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const selectAll = () => {
    if (unbilledSessions) {
      setSelectedSessions(unbilledSessions.map(s => s.id));
    }
  };

  const selectedSessionsData = unbilledSessions?.filter(s => selectedSessions.includes(s.id)) || [];
  const subtotal = selectedSessionsData.reduce((sum, s) => sum + Number(s.price), 0);
  const watchTaxRate = form.watch('tax_rate');
  const taxAmount = subtotal * (watchTaxRate / 100);
  const total = subtotal + taxAmount;

  const onSubmit = async (values: FormValues) => {
    if (selectedSessions.length === 0) return;

    const items = selectedSessionsData.map(session => ({
      session_id: session.id,
      description: `Sesión ${session.session_type || 'individual'} - ${format(new Date(session.session_date), "d MMM yyyy", { locale: es })}`,
      quantity: 1,
      unit_price: Number(session.price),
      total: Number(session.price),
    }));

    await createInvoice.mutateAsync({
      invoice: {
        patient_id: values.patient_id,
        issue_date: format(values.issue_date, 'yyyy-MM-dd'),
        subtotal,
        tax_rate: values.tax_rate,
        tax_amount: taxAmount,
        total,
        status: 'draft',
        is_recapitulative: true,
        notes: values.notes || null,
      },
      items,
    });
    
    form.reset();
    setSelectedPatient(null);
    setSelectedSessions([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nueva factura recapitulativa
          </DialogTitle>
          <DialogDescription>
            Selecciona un contacto y las sesiones a incluir en la factura.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto</FormLabel>
                  <Select onValueChange={handlePatientChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar contacto" />
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

            {selectedPatient && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Sesiones a facturar</FormLabel>
                  {unbilledSessions && unbilledSessions.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                      Seleccionar todas
                    </Button>
                  )}
                </div>
                
                {!unbilledSessions || unbilledSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay sesiones pendientes de facturar para este contacto
                  </p>
                ) : (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {unbilledSessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                          selectedSessions.includes(session.id) && "bg-primary/5"
                        )}
                        onClick={() => toggleSession(session.id)}
                      >
                        <Checkbox
                          checked={selectedSessions.includes(session.id)}
                          onCheckedChange={() => toggleSession(session.id)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {format(new Date(session.session_date), "d 'de' MMMM yyyy", { locale: es })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {session.start_time} - {session.end_time} · {session.session_type || 'Individual'}
                          </p>
                        </div>
                        <span className="font-medium">{Number(session.price).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="issue_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de emisión</FormLabel>
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
                            {field.value ? format(field.value, "d MMM yyyy") : <span>Seleccionar</span>}
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
                name="tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IVA %</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {selectedSessions.length > 0 && (
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{selectedSessions.length} sesiones seleccionadas</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Base imponible:</span>
                  <span>{subtotal.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>IVA ({watchTaxRate}%):</span>
                  <span>{taxAmount.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t">
                  <span>Total:</span>
                  <span>{total.toFixed(2)}€</span>
                </div>
              </div>
            )}

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
              <Button 
                type="submit" 
                disabled={createInvoice.isPending || selectedSessions.length === 0}
              >
                {createInvoice.isPending ? 'Creando...' : 'Crear factura'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

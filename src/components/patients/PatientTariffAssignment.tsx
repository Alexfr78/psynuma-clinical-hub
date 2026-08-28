import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  useTariffPlans,
  usePatientTariffAssignment,
  useAssignTariffPlan,
  useRemoveTariffAssignment,
} from '@/hooks/useTariffPlans';
import { usePatientCustomPrices } from '@/hooks/useCustomPrices';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/ui/icon';

// ── Schema ────────────────────────────────────────────────────────────────────

const assignSchema = z.object({
  tariff_plan_id: z.string().uuid('Selecciona un plan'),
  start_date: z.date({ required_error: 'Requerida' }),
  end_date: z.date().nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

// ── Assign Dialog ──────────────────────────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
}) {
  const { data: plans } = useTariffPlans();
  const assign = useAssignTariffPlan();

  const form = useForm<z.infer<typeof assignSchema>>({
    resolver: zodResolver(assignSchema),
    defaultValues: { tariff_plan_id: '', start_date: new Date(), end_date: null, notes: null },
  });

  const onSubmit = async (values: z.infer<typeof assignSchema>) => {
    await assign.mutateAsync({
      patient_id: patientId,
      tariff_plan_id: values.tariff_plan_id,
      start_date: format(values.start_date, 'yyyy-MM-dd'),
      end_date: values.end_date ? format(values.end_date, 'yyyy-MM-dd') : null,
      notes: values.notes || null,
    });
    onOpenChange(false);
    form.reset();
  };

  const activePlans = (plans ?? []).filter(p => p.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="layers" className="h-5 w-5 text-violet-600" />
            Asignar plan tarifario
          </DialogTitle>
          <DialogDescription>
            El plan se aplicará automáticamente al crear sesiones y bonos.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tariff_plan_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan tarifario</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar plan..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activePlans.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            {p.name}
                            {p.is_default && (
                              <Badge variant="outline" className="text-xs text-violet-600 border-violet-200 py-0">defecto</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Desde *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                            {field.value ? format(field.value, 'dd/MM/yyyy') : 'Seleccionar'}
                            <Icon name="calendar_month" className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Hasta (opcional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                            {field.value ? format(field.value, 'dd/MM/yyyy') : 'Indefinida'}
                            <Icon name="calendar_month" className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ?? undefined}
                          onSelect={d => field.onChange(d ?? null)}
                          initialFocus
                          locale={es}
                          disabled={date => date < (form.getValues('start_date') ?? new Date())}
                        />
                        {field.value && (
                          <div className="p-2 border-t">
                            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => field.onChange(null)}>
                              Quitar fecha fin
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <FormDescription className="text-xs">Sin fecha = vigente indefinidamente</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Convenio con empresa X, vigente hasta renovación..."
                      rows={2}
                      className="resize-none"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={assign.isPending}>Asignar tarifa</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface PatientTariffAssignmentProps {
  patientId: string;
}

export function PatientTariffAssignment({ patientId }: PatientTariffAssignmentProps) {
  const { isAdmin, isProfessional } = useAuth();
  const canManage = isAdmin || isProfessional;

  const { data: assignment, isLoading } = usePatientTariffAssignment(patientId);
  const { data: customPrices } = usePatientCustomPrices(patientId);
  const remove = useRemoveTariffAssignment();

  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const activeCustomPricesCount = (customPrices ?? []).filter(p => {
    if (!p.is_active) return false;
    const today = new Date().toISOString().split('T')[0];
    return p.start_date <= today && (!p.end_date || p.end_date >= today);
  }).length;

  const isTemporary = !!assignment?.end_date;
  const today = new Date().toISOString().split('T')[0];
  const isExpired = assignment?.end_date && assignment.end_date < today;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Icon name="layers" className="h-4 w-4 text-violet-600" />
          Tarifa asignada
        </h4>
        {canManage && (
          <div className="flex gap-2">
            {assignment && !isExpired ? (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAssignOpen(true)}>
                  <Icon name="edit_note" className="h-3 w-3" />
                  Cambiar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Icon name="close" className="h-3 w-3" />
                  Quitar
                </Button>
              </>
            ) : (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAssignOpen(true)}>
                <Icon name="layers" className="h-3 w-3" />
                Asignar tarifa
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-14 w-full" />
      ) : assignment && !isExpired ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1" variant="outline">
              <Icon name="layers" className="h-3 w-3" />
              {assignment.tariff_plan?.name ?? '—'}
            </Badge>
            {isTemporary && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                Hasta {format(new Date(assignment.end_date! + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
              </Badge>
            )}
            {assignment.tariff_plan?.is_default && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Por defecto</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Vigente desde {format(new Date(assignment.start_date + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
            {assignment.end_date ? ` hasta ${format(new Date(assignment.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}` : ' (indefinida)'}
          </p>
          {assignment.notes && (
            <p className="text-xs text-muted-foreground italic">"{assignment.notes}"</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="check_circle" className="h-4 w-4 text-muted-foreground/50" />
          Sin tarifa asignada — se aplican precios generales
        </div>
      )}

      {/* Leyenda de prioridad */}
      <div className="rounded border bg-muted/30 p-2.5 space-y-1.5 text-xs">
        <p className="font-medium text-muted-foreground">Prioridad de precios aplicados:</p>
        <div className="space-y-1">
          <PriorityRow
            icon={<Icon name="sell" className="h-3 w-3 text-emerald-600" />}
            label="Excepción manual"
            detail={activeCustomPricesCount > 0 ? `${activeCustomPricesCount} activa${activeCustomPricesCount !== 1 ? 's' : ''}` : 'Ninguna'}
            active={activeCustomPricesCount > 0}
            priority={1}
          />
          <PriorityRow
            icon={<Icon name="layers" className="h-3 w-3 text-violet-600" />}
            label="Plan tarifario"
            detail={assignment && !isExpired ? (assignment.tariff_plan?.name ?? '—') : 'No asignado'}
            active={!!assignment && !isExpired}
            priority={2}
          />
          <PriorityRow
            icon={<Icon name="info" className="h-3 w-3 text-muted-foreground" />}
            label="Tarifa general"
            detail="Precio base del servicio/bono"
            active={false}
            priority={3}
          />
        </div>
      </div>

      {activeCustomPricesCount > 0 && (
        <Alert className="py-2 bg-emerald-50 border-emerald-200">
          <Icon name="sell" className="h-3.5 w-3.5 text-emerald-600" />
          <AlertDescription className="text-xs text-emerald-700">
            Este paciente tiene {activeCustomPricesCount} excepción{activeCustomPricesCount !== 1 ? 'es' : ''} manual{activeCustomPricesCount !== 1 ? 'es' : ''} que tienen prioridad sobre la tarifa asignada.
          </AlertDescription>
        </Alert>
      )}

      {/* Dialogs */}
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} patientId={patientId} />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar tarifa asignada?</AlertDialogTitle>
            <AlertDialogDescription>
              El paciente pasará a usar los precios generales del centro para los servicios y bonos sin excepción manual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (assignment) {
                  remove.mutate({ id: assignment.id, patientId });
                  setConfirmRemove(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quitar tarifa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PriorityRow({
  icon,
  label,
  detail,
  active,
  priority,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  active: boolean;
  priority: number;
}) {
  return (
    <div className={cn('flex items-center gap-2', !active && 'opacity-50')}>
      <span className="text-muted-foreground font-mono text-xs w-3">{priority}.</span>
      {icon}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground ml-auto">{detail}</span>
    </div>
  );
}

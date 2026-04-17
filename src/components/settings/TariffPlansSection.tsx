import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Layers, Plus, Pencil, Copy, PowerOff, Users, Tag, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  useTariffPlans,
  useCreateTariffPlan,
  useUpdateTariffPlan,
  useDuplicateTariffPlan,
  type TariffPlan,
  type TariffPlanWithStats,
} from '@/hooks/useTariffPlans';
import { TariffPlanDetailDialog } from './TariffPlanDetailDialog';

// ── Create/Edit Dialog ────────────────────────────────────────────────────────

const planSchema = z.object({
  name: z.string().min(1, 'Nombre obligatorio').max(100),
  description: z.string().max(300).optional(),
  is_default: z.boolean().default(false),
});

function PlanFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: TariffPlan;
}) {
  const createPlan = useCreateTariffPlan();
  const updatePlan = useUpdateTariffPlan();

  const form = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: existing?.name ?? '',
      description: existing?.description ?? '',
      is_default: existing?.is_default ?? false,
    },
  });

  const onSubmit = async (values: z.infer<typeof planSchema>) => {
    if (existing) {
      await updatePlan.mutateAsync({ id: existing.id, ...values, description: values.description || null });
    } else {
      await createPlan.mutateAsync({
        name: values.name,
        is_default: values.is_default,
        description: values.description || undefined,
      });
    }
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-600" />
            {existing ? 'Editar plan tarifario' : 'Nuevo plan tarifario'}
          </DialogTitle>
          <DialogDescription>
            Los planes tarifarios definen precios por tipo de sesión y bono, asignables a pacientes.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Tarifa Reducida" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Para convenios, colectivos o casos especiales..."
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
            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Tarifa por defecto</FormLabel>
                    <FormDescription className="text-xs">
                      Se aplica a pacientes sin tarifa asignada explícitamente.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPlan.isPending || updatePlan.isPending}>
                {existing ? 'Guardar cambios' : 'Crear plan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan Card ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onEdit,
  onDetail,
  onDuplicate,
  onToggleActive,
}: {
  plan: TariffPlanWithStats;
  onEdit: (p: TariffPlan) => void;
  onDetail: (p: TariffPlan) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (p: TariffPlan) => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${!plan.is_active ? 'opacity-60' : ''}`}
      onClick={() => onDetail(plan)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{plan.name}</span>
              {plan.is_default && (
                <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200 gap-1" variant="outline">
                  <Star className="h-3 w-3" />
                  Por defecto
                </Badge>
              )}
              {!plan.is_active && (
                <Badge variant="outline" className="text-xs text-muted-foreground">Inactiva</Badge>
              )}
            </div>
            {plan.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" />
                {plan.item_count} precios
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {plan.patient_count} paciente{plan.patient_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar datos del plan" onClick={() => onEdit(plan)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicar plan" onClick={() => onDuplicate(plan.id)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={plan.is_active ? 'Desactivar plan' : 'Activar plan'}
              onClick={() => onToggleActive(plan)}
            >
              <PowerOff className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Section ───────────────────────────────────────────────────────────────

export function TariffPlansSection() {
  const { data: plans, isLoading } = useTariffPlans();
  const updatePlan = useUpdateTariffPlan();
  const duplicatePlan = useDuplicateTariffPlan();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TariffPlan | undefined>();
  const [detailPlan, setDetailPlan] = useState<TariffPlan | undefined>();
  const [togglingPlan, setTogglingPlan] = useState<TariffPlan | undefined>();

  const handleToggleActive = async () => {
    if (!togglingPlan) return;
    await updatePlan.mutateAsync({ id: togglingPlan.id, is_active: !togglingPlan.is_active });
    setTogglingPlan(undefined);
  };

  const activePlans = (plans ?? []).filter(p => p.is_active);
  const inactivePlans = (plans ?? []).filter(p => !p.is_active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-600" />
              Planes tarifarios
            </CardTitle>
            <CardDescription className="mt-1">
              Define tarifas reutilizables con precios personalizados por tipo de sesión y bono.
              Asígnales pacientes para aplicarlas automáticamente.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo plan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Prioridad de resolución */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-medium text-muted-foreground">Prioridad de resolución de precios:</p>
          <ol className="space-y-0.5 text-muted-foreground list-decimal list-inside">
            <li><strong className="text-foreground">Excepción manual</strong> del paciente para ese servicio/bono (máxima prioridad)</li>
            <li><strong className="text-foreground">Plan tarifario</strong> asignado al paciente si incluye ese servicio/bono</li>
            <li><strong className="text-foreground">Tarifa general</strong> del servicio o bono (precio base)</li>
          </ol>
        </div>

        <Separator />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : (plans ?? []).length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center border rounded-lg bg-muted/20">
            <Layers className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-muted-foreground">Sin planes tarifarios</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Crea tu primer plan para gestionar precios por perfil de paciente.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="gap-1 mt-1">
              <Plus className="h-4 w-4" />
              Crear primer plan
            </Button>
          </div>
        ) : (
          <>
            {/* Active plans */}
            <div className="space-y-2">
              {activePlans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={setEditingPlan}
                  onDetail={setDetailPlan}
                  onDuplicate={(id) => duplicatePlan.mutate(id)}
                  onToggleActive={setTogglingPlan}
                />
              ))}
            </div>

            {/* Inactive plans */}
            {inactivePlans.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Inactivos</p>
                {inactivePlans.map(plan => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onEdit={setEditingPlan}
                    onDetail={setDetailPlan}
                    onDuplicate={(id) => duplicatePlan.mutate(id)}
                    onToggleActive={setTogglingPlan}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Dialogs */}
      <PlanFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PlanFormDialog
        open={!!editingPlan}
        onOpenChange={v => !v && setEditingPlan(undefined)}
        existing={editingPlan}
      />

      {detailPlan && (
        <TariffPlanDetailDialog
          open={!!detailPlan}
          onOpenChange={v => !v && setDetailPlan(undefined)}
          plan={detailPlan}
        />
      )}

      <AlertDialog open={!!togglingPlan} onOpenChange={() => setTogglingPlan(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingPlan?.is_active ? 'Desactivar plan' : 'Activar plan'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingPlan?.is_active
                ? `Al desactivar "${togglingPlan?.name}" los pacientes asignados pasarán a usar su precio base.`
                : `El plan "${togglingPlan?.name}" volverá a estar disponible para asignar a pacientes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive}>
              {togglingPlan?.is_active ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

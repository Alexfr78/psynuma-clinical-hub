import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { useBonoTemplates } from '@/hooks/useBonos';
import {
  useTariffPlanItems,
  useUpsertTariffPlanItem,
  useDeleteTariffPlanItem,
  useUpdateTariffPlan,
  type TariffPlan,
  type TariffPlanItem,
} from '@/hooks/useTariffPlans';
import { Icon } from '@/components/ui/icon';

// ── Item row (editable inline) ─────────────────────────────────────────────────

function ItemRow({
  item,
  planId,
  onDelete,
}: {
  item: TariffPlanItem;
  planId: string;
  onDelete: (item: TariffPlanItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(item.price));
  const upsert = useUpsertTariffPlanItem();

  const handleSave = async () => {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed < 0) return;
    await upsert.mutateAsync({
      tariff_plan_id: planId,
      target_type: item.target_type,
      target_id: item.target_id,
      price: parsed,
      existing_id: item.id,
    });
    setEditing(false);
  };

  const diff = item.base_price != null ? item.price - item.base_price : null;

  return (
    <tr className="border-b last:border-0 group">
      <td className="py-2.5 pr-3">
        <span className="text-sm font-medium">{item.target_name ?? item.target_id}</span>
      </td>
      <td className="py-2.5 pr-3 text-right text-sm text-muted-foreground">
        {item.base_price != null ? `${item.base_price.toFixed(2)} €` : '—'}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {editing ? (
          <Input
            type="number"
            step="0.01"
            min={0}
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="h-7 w-24 text-right ml-auto"
            autoFocus
          />
        ) : (
          <span className="font-semibold text-sm">{item.price.toFixed(2)} €</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {diff != null && (
          <span className={diff < 0 ? 'text-emerald-600 text-xs' : diff > 0 ? 'text-red-500 text-xs' : 'text-muted-foreground text-xs'}>
            {diff < 0 ? `−${Math.abs(diff).toFixed(2)} €` : diff > 0 ? `+${diff.toFixed(2)} €` : '='}
          </span>
        )}
      </td>
      <td className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={handleSave} disabled={upsert.isPending}>
                <Icon name="check" className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setPrice(String(item.price)); setEditing(false); }}>
                <Icon name="close" className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Icon name="edit" className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(item)}>
                <Icon name="delete" className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Add item form ──────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  target_type: z.enum(['session_type', 'bono_template']),
  target_id: z.string().uuid('Selecciona un producto'),
  price: z.coerce.number({ invalid_type_error: 'Precio requerido' }).min(0),
});

function AddItemForm({
  planId,
  existingItems,
  targetType,
}: {
  planId: string;
  existingItems: TariffPlanItem[];
  targetType: 'session_type' | 'bono_template';
}) {
  const { data: sessionTypes } = useSessionTypes();
  const { data: bonoTemplates } = useBonoTemplates();
  const upsert = useUpsertTariffPlanItem();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof addItemSchema>>({
    resolver: zodResolver(addItemSchema),
    defaultValues: { target_type: targetType, target_id: '', price: 0 },
  });

  const usedIds = existingItems.filter(i => i.target_type === targetType).map(i => i.target_id);
  const available = targetType === 'session_type'
    ? (sessionTypes ?? []).filter(s => s.is_active !== false && !usedIds.includes(s.id)).map(s => ({ id: s.id, label: s.name, base_price: s.default_price }))
    : (bonoTemplates ?? []).filter(b => b.is_active !== false && !usedIds.includes(b.id)).map(b => ({ id: b.id, label: b.name, base_price: Number(b.total_price) }));

  const watchTargetId = form.watch('target_id');
  const selectedBase = available.find(a => a.id === watchTargetId)?.base_price;

  const onSubmit = async (values: z.infer<typeof addItemSchema>) => {
    await upsert.mutateAsync({
      tariff_plan_id: planId,
      target_type: values.target_type,
      target_id: values.target_id,
      price: values.price,
    });
    form.reset({ target_type: targetType, target_id: '', price: 0 });
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1 mt-2"
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
      >
        <Icon name="add" className="h-3.5 w-3.5" />
        {available.length === 0 ? 'Todos los productos incluidos' : 'Añadir producto'}
      </Button>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-2 mt-3 p-3 bg-muted/40 rounded-lg border">
        <FormField
          control={form.control}
          name="target_id"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel className="text-xs">{targetType === 'session_type' ? 'Servicio' : 'Bono'}</FormLabel>
              <Select onValueChange={(v) => {
                field.onChange(v);
                const base = available.find(a => a.id === v)?.base_price;
                if (base != null) form.setValue('price', base);
              }} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {available.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label} ({a.base_price.toFixed(2)} €)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem className="w-28">
              <FormLabel className="text-xs">
                Precio (€)
                {selectedBase != null && (
                  <span className="text-muted-foreground ml-1">base: {selectedBase.toFixed(2)}</span>
                )}
              </FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min={0} className="h-8 text-sm" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" className="h-8" disabled={upsert.isPending}>
          Añadir
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)}>
          <Icon name="close" className="h-3.5 w-3.5" />
        </Button>
      </form>
    </Form>
  );
}

// ── Items Table ────────────────────────────────────────────────────────────────

function ItemsTable({
  planId,
  targetType,
  label,
}: {
  planId: string;
  targetType: 'session_type' | 'bono_template';
  label: string;
}) {
  const { data: items, isLoading } = useTariffPlanItems(planId);
  const deleteItem = useDeleteTariffPlanItem();
  const [deletingItem, setDeletingItem] = useState<TariffPlanItem | null>(null);

  const filtered = (items ?? []).filter(i => i.target_type === targetType);

  return (
    <div className="space-y-2">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
          Sin precios de {label.toLowerCase()} definidos en esta tarifa.
        </div>
      ) : (
        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">{label}</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Precio base</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">En tarifa</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Dif.</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(item => (
              <ItemRow key={item.id} item={item} planId={planId} onDelete={setDeletingItem} />
            ))}
          </tbody>
        </table>
      )}

      <AddItemForm planId={planId} existingItems={items ?? []} targetType={targetType} />

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar precio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el precio personalizado de "{deletingItem?.target_name}". Los pacientes con esta tarifa asignada pasarán a usar la tarifa general del producto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingItem) {
                  deleteItem.mutate({ id: deletingItem.id, planId });
                  setDeletingItem(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Dialog ────────────────────────────────────────────────────────────────

interface TariffPlanDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: TariffPlan;
}

export function TariffPlanDetailDialog({ open, onOpenChange, plan }: TariffPlanDetailDialogProps) {
  const updatePlan = useUpdateTariffPlan();

  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const [isDefault, setIsDefault] = useState(plan.is_default);
  const [editingMeta, setEditingMeta] = useState(false);

  const handleSaveMeta = async () => {
    await updatePlan.mutateAsync({
      id: plan.id,
      name,
      description: description || null,
      is_default: isDefault,
    });
    setEditingMeta(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="layers" className="h-5 w-5 text-violet-600" />
            {plan.name}
          </DialogTitle>
          <DialogDescription>
            Gestiona los precios por producto de este plan tarifario.
          </DialogDescription>
        </DialogHeader>

        {/* Plan metadata */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          {editingMeta ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Nombre</label>
                <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Descripción</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is-default" checked={isDefault} onCheckedChange={setIsDefault} />
                <label htmlFor="is-default" className="text-sm cursor-pointer">Tarifa por defecto del centro</label>
              </div>
              {isDefault && !plan.is_default && (
                <Alert className="py-2">
                  <Icon name="error" className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Al marcar esta como predeterminada, la anterior perderá ese estado.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setName(plan.name); setDescription(plan.description ?? ''); setIsDefault(plan.is_default); setEditingMeta(false); }}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSaveMeta} disabled={updatePlan.isPending}>
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{plan.name}</span>
                  {plan.is_default && <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200" variant="outline">Por defecto</Badge>}
                  {!plan.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactiva</Badge>}
                </div>
                {plan.description && <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>}
              </div>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditingMeta(true)}>
                <Icon name="edit" className="h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Items por tipo */}
        <Tabs defaultValue="services">
          <TabsList className="w-full">
            <TabsTrigger value="services" className="flex-1">Tipos de sesión</TabsTrigger>
            <TabsTrigger value="bonos" className="flex-1">Bonos</TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-4">
            <ItemsTable planId={plan.id} targetType="session_type" label="Tipo de sesión" />
          </TabsContent>

          <TabsContent value="bonos" className="mt-4">
            <ItemsTable planId={plan.id} targetType="bono_template" label="Plantilla de bono" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

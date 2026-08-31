import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/hooks/useAuth';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useSuppliers } from '@/hooks/useSuppliers';
import {
  useExpenseRecurringTemplates,
  useCreateExpenseRecurringTemplate,
  useUpdateExpenseRecurringTemplate,
  useToggleExpenseRecurringTemplate,
  useDeleteExpenseRecurringTemplate,
  type ExpenseRecurrenceFrequency,
  type ExpenseRecurringTemplateWithRelations,
} from '@/hooks/useExpenseRecurringTemplates';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface FormState {
  category_id: string;
  supplier_id: string;
  description: string;
  default_amount: string;
  frequency: ExpenseRecurrenceFrequency;
  day_of_period: string;
  anchor_month: string;
  vat_rate: string;
  irpf_rate: string;
}

const EMPTY_FORM: FormState = {
  category_id: '',
  supplier_id: '',
  description: '',
  default_amount: '',
  frequency: 'monthly',
  day_of_period: '1',
  anchor_month: '1',
  vat_rate: '',
  irpf_rate: '',
};

export function RecurringExpensesSection() {
  const { isAdmin } = useAuth();
  const { data: templates, isLoading } = useExpenseRecurringTemplates();
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useSuppliers();
  const createTemplate = useCreateExpenseRecurringTemplate();
  const updateTemplate = useUpdateExpenseRecurringTemplate();
  const toggleTemplate = useToggleExpenseRecurringTemplate();
  const deleteTemplate = useDeleteExpenseRecurringTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecurringTemplateWithRelations | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setForm({
        category_id: editing.category_id,
        supplier_id: editing.supplier_id || '',
        description: editing.description,
        default_amount: String(editing.default_amount),
        frequency: editing.frequency,
        day_of_period: String(editing.day_of_period),
        anchor_month: String(editing.anchor_month ?? 1),
        vat_rate: editing.vat_rate != null ? String(editing.vat_rate) : '',
        irpf_rate: editing.irpf_rate != null ? String(editing.irpf_rate) : '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [dialogOpen, editing]);

  const handleSave = async () => {
    if (!form.category_id || !form.description.trim() || !form.default_amount) return;

    const payload = {
      category_id: form.category_id,
      supplier_id: form.supplier_id || null,
      description: form.description.trim(),
      default_amount: parseFloat(form.default_amount),
      frequency: form.frequency,
      day_of_period: parseInt(form.day_of_period, 10),
      anchor_month: form.frequency === 'monthly' ? null : parseInt(form.anchor_month, 10),
      vat_rate: form.vat_rate ? parseFloat(form.vat_rate) : null,
      irpf_rate: form.irpf_rate ? parseFloat(form.irpf_rate) : null,
    };

    if (editing) {
      await updateTemplate.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createTemplate.mutateAsync(payload);
    }
    setDialogOpen(false);
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const frequencyLabel = (freq: ExpenseRecurrenceFrequency) => (freq === 'monthly' ? 'Mensual' : freq === 'quarterly' ? 'Trimestral' : 'Anual');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos recurrentes</CardTitle>
        <CardDescription>
          Gastos fijos que se generan automáticamente cada mes/trimestre/año (alquiler, software, seguros...).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates?.map((template) => (
          <div key={template.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">{template.description}</p>
              <p className="text-xs text-muted-foreground">
                {template.category?.name} · {frequencyLabel(template.frequency)} · día {template.day_of_period}
                {template.supplier ? ` · ${template.supplier.name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium tabular-nums">{Number(template.default_amount).toFixed(2)} €</span>
              {isAdmin && (
                <>
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={(checked) => toggleTemplate.mutate({ id: template.id, isActive: checked })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(template); setDialogOpen(true); }}>
                    <Icon name="edit" className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteTemplate.mutate(template.id)}
                  >
                    <Icon name="delete" className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}

        {(!templates || templates.length === 0) && (
          <p className="text-sm text-muted-foreground py-4 text-center">No hay gastos recurrentes configurados.</p>
        )}

        {isAdmin && (
          <Button variant="outline" className="w-full" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Icon name="add" className="h-4 w-4 mr-2" />
            Añadir gasto recurrente
          </Button>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Proveedor (opcional)</Label>
              <Select value={form.supplier_id || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguno</SelectItem>
                  {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Importe (€)</Label>
                <Input type="number" min={0} step="0.01" value={form.default_amount} onChange={(e) => setForm((f) => ({ ...f, default_amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as ExpenseRecurrenceFrequency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Día del periodo (1-28)</Label>
                <Input type="number" min={1} max={28} value={form.day_of_period} onChange={(e) => setForm((f) => ({ ...f, day_of_period: e.target.value }))} />
              </div>
              {form.frequency !== 'monthly' && (
                <div className="space-y-2">
                  <Label>Mes ancla</Label>
                  <Select value={form.anchor_month} onValueChange={(v) => setForm((f) => ({ ...f, anchor_month: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IVA (%) opcional</Label>
                <Input type="number" min={0} max={100} step="0.01" value={form.vat_rate} onChange={(e) => setForm((f) => ({ ...f, vat_rate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>IRPF (%) opcional</Label>
                <Input type="number" min={0} max={100} step="0.01" value={form.irpf_rate} onChange={(e) => setForm((f) => ({ ...f, irpf_rate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTemplate.isPending || updateTemplate.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

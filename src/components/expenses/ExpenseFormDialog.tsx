import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/ui/icon';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useSuppliers, useCreateSupplier } from '@/hooks/useSuppliers';
import { useProfessionalsWithRoles } from '@/hooks/useProfessionals';
import {
  useCreateExpense,
  useUpdateExpense,
  useUploadExpenseReceipt,
  useExtractExpenseReceiptData,
  useExtractExpenseReceiptPreview,
  type ExpenseKind,
  type ExpenseWithRelations,
  type ExtractedReceiptData,
} from '@/hooks/useExpenses';
import { validateSpanishTaxId } from '@/lib/nif-validation';

const VAT_RATE_OPTIONS = [21, 10, 4, 0];

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseWithRelations | null;
}

export function ExpenseFormDialog({ open, onOpenChange, expense }: ExpenseFormDialogProps) {
  const { isAdmin } = useAuth();
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useSuppliers();
  const { data: professionals } = useProfessionalsWithRoles();
  const createSupplier = useCreateSupplier();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const uploadReceipt = useUploadExpenseReceipt();
  const extractReceiptData = useExtractExpenseReceiptData();
  const extractReceiptPreview = useExtractExpenseReceiptPreview();

  const isEditing = !!expense;

  // 'fixed_recurring' is never selectable via the radio group (it's only ever
  // set by the recurring-expense cron) — but when editing an existing
  // fixed_recurring expense we must preserve its kind rather than silently
  // reclassifying it as 'variable' on save.
  const [kind, setKind] = useState<ExpenseKind>('variable');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');

  // Supplier invoice fields
  const [supplierId, setSupplierId] = useState('');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierTaxId, setNewSupplierTaxId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceIssueDate, setInvoiceIssueDate] = useState('');
  const [taxBase, setTaxBase] = useState('');
  const [vatRate, setVatRate] = useState<string>('21');
  const [vatAmount, setVatAmount] = useState('');
  const [irpfRate, setIrpfRate] = useState('');
  const [irpfAmount, setIrpfAmount] = useState('');

  // Professional payment fields (manual, admin-only)
  const [professionalId, setProfessionalId] = useState('');

  // Attachment
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // Set when the "upload first" AI flow already extracted data for
  // pendingFile — lets handleSubmit skip a second, redundant AI call.
  const [aiPreviewData, setAiPreviewData] = useState<ExtractedReceiptData | null>(null);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setKind(expense.kind);
      setCategoryId(expense.category_id);
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setExpenseDate(expense.expense_date);
      setDueDate(expense.due_date || '');
      setPaymentMethod(expense.payment_method || '');
      setNotes(expense.notes || '');
      setSupplierId(expense.supplier_id || '');
      setSupplierInvoiceNumber(expense.supplier_invoice_number || '');
      setInvoiceIssueDate(expense.invoice_issue_date || '');
      setTaxBase(expense.tax_base != null ? String(expense.tax_base) : '');
      setVatRate(expense.vat_rate != null ? String(expense.vat_rate) : '21');
      setVatAmount(expense.vat_amount != null ? String(expense.vat_amount) : '');
      setIrpfRate(expense.irpf_rate != null ? String(expense.irpf_rate) : '');
      setIrpfAmount(expense.irpf_amount != null ? String(expense.irpf_amount) : '');
      setProfessionalId(expense.professional_id || '');
    } else {
      setKind('variable');
      setCategoryId('');
      setDescription('');
      setAmount('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setDueDate('');
      setPaymentMethod('');
      setNotes('');
      setSupplierId('');
      setSupplierInvoiceNumber('');
      setInvoiceIssueDate('');
      setTaxBase('');
      setVatRate('21');
      setVatAmount('');
      setIrpfRate('');
      setIrpfAmount('');
      setProfessionalId('');
    }
    setShowNewSupplier(false);
    setNewSupplierName('');
    setNewSupplierTaxId('');
    setPendingFile(null);
    setAiPreviewData(null);
  }, [open, expense]);

  // Recalcular cuotas solo cuando el usuario edita base o tipo — nunca en la
  // carga inicial del gasto, para no sobrescribir cuotas guardadas que no
  // coinciden con base*tipo (redondeos del proveedor, datos extraídos por IA).
  const recomputeVat = (baseStr: string, rateStr: string) => {
    const base = parseFloat(baseStr);
    const rate = parseFloat(rateStr);
    if (!isNaN(base) && !isNaN(rate)) {
      setVatAmount((base * (rate / 100)).toFixed(2));
    }
  };
  const recomputeIrpf = (baseStr: string, rateStr: string) => {
    const base = parseFloat(baseStr);
    const rate = parseFloat(rateStr);
    if (!isNaN(base) && !isNaN(rate) && rateStr !== '') {
      setIrpfAmount((base * (rate / 100)).toFixed(2));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10 MB.');
      return;
    }
    setPendingFile(file);
  };

  // Resolves extracted.supplier_name/supplier_tax_id against existing
  // suppliers; auto-creates one if there's no match, so the user never has
  // to manually create a supplier just because the AI recognized a new one.
  const resolveSupplierFromExtraction = async (extracted: ExtractedReceiptData) => {
    const name = extracted.supplier_name?.trim();
    const taxId = extracted.supplier_tax_id?.trim();
    if (!name && !taxId) return;

    const existing = (suppliers ?? []).find((s) => {
      if (taxId && s.tax_id) return s.tax_id.trim().toUpperCase() === taxId.toUpperCase();
      if (name) return s.name.trim().toLowerCase() === name.toLowerCase();
      return false;
    });

    if (existing) {
      setSupplierId(existing.id);
      return;
    }
    if (name) {
      try {
        const created = await createSupplier.mutateAsync({ name, tax_id: taxId || null });
        setSupplierId(created.id);
      } catch {
        // useCreateSupplier already surfaces a toast on failure.
      }
    }
  };

  const applyExtractedData = (extracted: ExtractedReceiptData) => {
    if (extracted.total_amount != null) setAmount(String(extracted.total_amount));
    if (extracted.issue_date) {
      setInvoiceIssueDate(extracted.issue_date);
      setExpenseDate(extracted.issue_date);
    }
    if (extracted.invoice_number) setSupplierInvoiceNumber(extracted.invoice_number);
    if (extracted.tax_base != null) setTaxBase(String(extracted.tax_base));
    if (extracted.vat_rate != null) setVatRate(String(extracted.vat_rate));
    if (extracted.vat_amount != null) setVatAmount(String(extracted.vat_amount));
    if (extracted.irpf_rate != null) setIrpfRate(String(extracted.irpf_rate));
    if (extracted.irpf_amount != null) setIrpfAmount(String(extracted.irpf_amount));
    if (extracted.supplier_name) {
      setDescription((prev) => prev.trim() ? prev : `Factura ${extracted.supplier_name}`);
    }
  };

  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10 MB.');
      return;
    }

    setPendingFile(file);
    setKind('supplier_invoice');
    setAiPreviewData(null);

    try {
      const extracted = await extractReceiptPreview.mutateAsync(file);
      if (extracted) {
        setAiPreviewData(extracted);
        applyExtractedData(extracted);
        await resolveSupplierFromExtraction(extracted);
        toast.success('Datos extraídos de la factura. Revísalos antes de guardar.');
      }
    } catch {
      // useExtractExpenseReceiptPreview already surfaces a toast on failure;
      // the file stays attached so the user can still fill the form manually.
    }
  };

  const professionalOptions = (professionals ?? []).filter((p) => p.roles.includes('professional'));

  const handleSubmit = async () => {
    if (!categoryId || !description.trim() || !amount) {
      toast.error('Completa categoría, descripción e importe.');
      return;
    }
    if (kind === 'professional_payment' && !professionalId) {
      toast.error('Selecciona un profesional.');
      return;
    }

    let finalSupplierId = supplierId || null;
    if (kind === 'supplier_invoice' && showNewSupplier) {
      if (!newSupplierName.trim()) {
        toast.error('Indica el nombre del proveedor.');
        return;
      }
      if (newSupplierTaxId) {
        const validation = validateSpanishTaxId(newSupplierTaxId);
        if (!validation.valid) {
          toast.error(validation.message || 'NIF/CIF de proveedor no válido');
          return;
        }
      }
      const newSupplier = await createSupplier.mutateAsync({ name: newSupplierName.trim(), tax_id: newSupplierTaxId || null });
      finalSupplierId = newSupplier.id;
    }

    const payload = {
      kind,
      category_id: categoryId,
      description: description.trim(),
      amount: parseFloat(amount),
      expense_date: expenseDate,
      due_date: dueDate || null,
      payment_method: paymentMethod || null,
      notes: notes || null,
      supplier_id: kind === 'supplier_invoice' ? finalSupplierId : null,
      professional_id: kind === 'professional_payment' ? professionalId : null,
      supplier_invoice_number: kind === 'supplier_invoice' ? supplierInvoiceNumber || null : null,
      invoice_issue_date: kind === 'supplier_invoice' ? invoiceIssueDate || null : null,
      tax_base: kind === 'supplier_invoice' && taxBase ? parseFloat(taxBase) : null,
      vat_rate: kind === 'supplier_invoice' && vatRate !== '' ? parseFloat(vatRate) : null,
      vat_amount: kind === 'supplier_invoice' && vatAmount ? parseFloat(vatAmount) : null,
      irpf_rate: kind === 'supplier_invoice' && irpfRate ? parseFloat(irpfRate) : null,
      irpf_amount: kind === 'supplier_invoice' && irpfAmount ? parseFloat(irpfAmount) : null,
      // The "upload first" AI flow already extracted this data before the
      // expense was created — record that so the receipt upload below
      // doesn't reset the status back to 'pending' and trigger a second,
      // redundant AI call.
      ...(aiPreviewData
        ? {
            ai_extraction_status: 'done' as const,
            ai_extraction_raw: aiPreviewData as unknown as Json,
          }
        : {}),
    };

    let expenseId: string;
    if (isEditing && expense) {
      const updated = await updateExpense.mutateAsync({ id: expense.id, ...payload });
      expenseId = updated.id;
    } else {
      const created = await createExpense.mutateAsync(payload);
      expenseId = created.id;
    }

    if (pendingFile) {
      setIsUploading(true);
      try {
        const { path } = await uploadReceipt.mutateAsync({ expenseId, file: pendingFile, skipStatusReset: !!aiPreviewData });
        setIsUploading(false);
        if (!aiPreviewData) {
          setIsExtracting(true);
          try {
            await extractReceiptData.mutateAsync({ expenseId, attachmentPath: path });
          } finally {
            setIsExtracting(false);
          }
        }
      } finally {
        setIsUploading(false);
      }
    }

    onOpenChange(false);
  };

  const isSaving = createExpense.isPending || updateExpense.isPending || isUploading || isExtracting;
  const isPreviewExtracting = extractReceiptPreview.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
          <DialogDescription>Registra un gasto del centro</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEditing && (
            <div className="space-y-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3">
              <Label className="text-sm font-medium">Sube una factura y la IA rellena el formulario</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/25 bg-background px-4 py-3 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                {isPreviewExtracting ? (
                  <span className="flex items-center gap-2"><Icon name="progress_activity" className="h-4 w-4 animate-spin" />Extrayendo datos con IA...</span>
                ) : pendingFile && aiPreviewData ? (
                  <span className="flex items-center gap-2 text-foreground"><Icon name="task_alt" className="h-4 w-4 text-green-600" />{pendingFile.name} — datos rellenados</span>
                ) : pendingFile ? (
                  <span className="flex items-center gap-2"><Icon name="description" className="h-4 w-4" />{pendingFile.name}</span>
                ) : (
                  <span className="flex items-center gap-2"><Icon name="upload" className="h-4 w-4" />Arrastra o selecciona una factura de proveedor (máx. 10 MB)</span>
                )}
                <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleAiFileSelect} disabled={isPreviewExtracting} />
              </label>
              <p className="text-xs text-muted-foreground">O completa los campos manualmente más abajo.</p>
            </div>
          )}

          {!isEditing && (
            <div className="space-y-2">
              <Label>Tipo de gasto</Label>
              <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="variable" id="kind-variable" />
                  <Label htmlFor="kind-variable" className="font-normal cursor-pointer">Variable / puntual</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="supplier_invoice" id="kind-supplier" />
                  <Label htmlFor="kind-supplier" className="font-normal cursor-pointer">Factura de proveedor</Label>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="professional_payment" id="kind-professional" />
                    <Label htmlFor="kind-professional" className="font-normal cursor-pointer">Pago a profesional (registro manual)</Label>
                  </div>
                )}
              </RadioGroup>
            </div>
          )}

          {kind === 'professional_payment' && (
            <div className="space-y-2">
              <Label>Profesional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger>
                <SelectContent>
                  {professionalOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Alquiler consulta agosto" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Importe (€)</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vencimiento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Transferencia, tarjeta..." />
            </div>
          </div>

          {kind === 'supplier_invoice' && (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  {!showNewSupplier ? (
                    <div className="flex gap-2">
                      <Select value={supplierId} onValueChange={setSupplierId}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                        <SelectContent>
                          {suppliers?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" onClick={() => setShowNewSupplier(true)} title="Nuevo proveedor">
                        <Icon name="add" className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-md bg-muted/40 p-2">
                      <Input placeholder="Nombre del proveedor" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
                      <Input placeholder="NIF/CIF (opcional)" value={newSupplierTaxId} onChange={(e) => setNewSupplierTaxId(e.target.value)} />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewSupplier(false)}>Cancelar</Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Nº factura proveedor</Label>
                  <Input value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha expedición</Label>
                  <Input type="date" value={invoiceIssueDate} onChange={(e) => setInvoiceIssueDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Base imponible (€)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={taxBase}
                    onChange={(e) => {
                      setTaxBase(e.target.value);
                      recomputeVat(e.target.value, vatRate);
                      recomputeIrpf(e.target.value, irpfRate);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IVA (%)</Label>
                  <Select
                    value={vatRate}
                    onValueChange={(v) => {
                      setVatRate(v);
                      recomputeVat(taxBase, v);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_RATE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cuota IVA (€)</Label>
                  <Input type="number" min={0} step="0.01" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IRPF (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={irpfRate}
                    onChange={(e) => {
                      setIrpfRate(e.target.value);
                      recomputeIrpf(taxBase, e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Retención (€)</Label>
                  <Input type="number" min={0} step="0.01" value={irpfAmount} onChange={(e) => setIrpfAmount(e.target.value)} />
                </div>
              </div>

              {isEditing && (
                <div className="space-y-2">
                  <Label>Justificante (PDF/foto)</Label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-4 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                    {pendingFile ? (
                      <span className="flex items-center gap-2"><Icon name="description" className="h-4 w-4" />{pendingFile.name}</span>
                    ) : (
                      <span className="flex items-center gap-2"><Icon name="upload" className="h-4 w-4" />Arrastra o selecciona un archivo (máx. 10 MB)</span>
                    )}
                    <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileSelect} />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Se extraerán automáticamente los datos fiscales con IA al guardar (puedes corregirlos después).
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Icon name="save" className="h-4 w-4 mr-2" />
            )}
            {isUploading ? 'Subiendo...' : isExtracting ? 'Extrayendo datos...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

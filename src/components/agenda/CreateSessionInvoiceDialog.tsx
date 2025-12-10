import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, AlertTriangle, Building2, User, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useCenter } from '@/hooks/useCenter';
import { useInvoiceSeries } from '@/hooks/useInvoiceSeries';
import { useCreateInvoiceWithSeries } from '@/hooks/useInvoices';
import { useUpdatePatient, usePatient } from '@/hooks/usePatients';
import { SessionWithRelations } from '@/hooks/useSessions';
import { toast } from 'sonner';

interface CreateSessionInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionWithRelations;
  onSuccess?: () => void;
}

interface PatientFormData {
  tax_id: string;
  address: string;
  city: string;
  postal_code: string;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  unitPrice: number;
  quantity: number;
  total: number;
  sessionId?: string;
}

export function CreateSessionInvoiceDialog({
  open,
  onOpenChange,
  session,
  onSuccess,
}: CreateSessionInvoiceDialogProps) {
  const { center } = useCenter();
  const { ordinarySeries } = useInvoiceSeries();
  const createInvoice = useCreateInvoiceWithSeries();
  const updatePatient = useUpdatePatient();
  
  // Fetch full patient data with fiscal info
  const { data: patientData } = usePatient(session.patient_id);
  
  const [invoiceType, setInvoiceType] = useState<'complete' | 'simplified'>('simplified');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [editingPatient, setEditingPatient] = useState(false);
  const [patientFormData, setPatientFormData] = useState<PatientFormData>({
    tax_id: '',
    address: '',
    city: '',
    postal_code: '',
  });
  const [savingPatient, setSavingPatient] = useState(false);

  // Invoice items state
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', unitPrice: 0, quantity: 1 });
  const [editItemData, setEditItemData] = useState({ description: '', unitPrice: 0, quantity: 1 });

  // Initialize items with session data
  useEffect(() => {
    if (session && open) {
      const sessionDateFormatted = format(new Date(session.session_date), "d 'de' MMMM yyyy", { locale: es });
      setItems([{
        id: crypto.randomUUID(),
        description: `Sesión de psicoterapia - ${sessionDateFormatted}`,
        unitPrice: Number(session.price) || 0,
        quantity: 1,
        total: Number(session.price) || 0,
        sessionId: session.id,
      }]);
      // Reset other states
      setEditingItemId(null);
      setAddingItem(false);
      setNewItem({ description: '', unitPrice: 0, quantity: 1 });
    }
  }, [session, open]);

  // Filter series by invoice type
  const availableSeries = ordinarySeries.filter(
    s => s.invoice_type === invoiceType && !s.is_archived
  );

  // Set default series when type changes or series are loaded
  useEffect(() => {
    const defaultSeries = availableSeries.find(s => s.is_default);
    if (defaultSeries) {
      setSelectedSeriesId(defaultSeries.id);
    } else if (availableSeries.length > 0) {
      setSelectedSeriesId(availableSeries[0].id);
    } else {
      setSelectedSeriesId('');
    }
  }, [invoiceType, ordinarySeries]);

  // Initialize patient form data from full patient data
  useEffect(() => {
    if (patientData) {
      setPatientFormData({
        tax_id: patientData.tax_id || '',
        address: patientData.address || '',
        city: patientData.city || '',
        postal_code: patientData.postal_code || '',
      });
    }
  }, [patientData]);

  // Required fields for complete invoice
  const requiredFields = ['tax_id', 'address', 'city', 'postal_code'] as const;
  const missingFields = invoiceType === 'complete' 
    ? requiredFields.filter(field => !patientFormData[field])
    : [];
  
  const canCreateInvoice = (invoiceType === 'simplified' || missingFields.length === 0) && items.length > 0;

  // Calculate amounts from items
  const taxRate = center?.default_tax_rate ?? 0;
  const taxName = center?.default_tax_name ?? 'IVA';
  
  const subtotal = useMemo(() => 
    items.reduce((sum, item) => sum + item.total, 0), 
    [items]
  );
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Item management functions
  const handleAddItem = () => {
    if (!newItem.description.trim()) {
      toast.error('El concepto es obligatorio');
      return;
    }
    const itemTotal = newItem.unitPrice * newItem.quantity;
    setItems([...items, {
      id: crypto.randomUUID(),
      description: newItem.description,
      unitPrice: newItem.unitPrice,
      quantity: newItem.quantity,
      total: itemTotal,
    }]);
    setAddingItem(false);
    setNewItem({ description: '', unitPrice: 0, quantity: 1 });
  };

  const handleStartEditItem = (item: InvoiceLineItem) => {
    setEditingItemId(item.id);
    setEditItemData({
      description: item.description,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    });
  };

  const handleUpdateItem = (itemId: string) => {
    if (!editItemData.description.trim()) {
      toast.error('El concepto es obligatorio');
      return;
    }
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          description: editItemData.description,
          unitPrice: editItemData.unitPrice,
          quantity: editItemData.quantity,
          total: editItemData.unitPrice * editItemData.quantity,
        };
      }
      return item;
    }));
    setEditingItemId(null);
  };

  const handleDeleteItem = (itemId: string) => {
    if (items.length <= 1) {
      toast.error('La factura debe tener al menos un ítem');
      return;
    }
    setItems(items.filter(item => item.id !== itemId));
  };

  const handleSavePatientData = async () => {
    if (!patientData) return;
    
    setSavingPatient(true);
    try {
      await updatePatient.mutateAsync({
        id: patientData.id,
        ...patientFormData,
      });
      toast.success('Datos del paciente actualizados');
      setEditingPatient(false);
    } catch (error) {
      toast.error('Error al guardar los datos');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!patientData || !selectedSeriesId || items.length === 0) return;

    try {
      await createInvoice.mutateAsync({
        invoice: {
          patient_id: patientData.id,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          status: 'draft',
        },
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.total,
          session_id: item.sessionId || null,
        })),
        seriesId: selectedSeriesId,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  if (!patientData) return null;

  const patientName = `${patientData.first_name} ${patientData.last_name}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Crear factura
          </DialogTitle>
        </DialogHeader>

        {/* Invoice Type Toggle */}
        <RadioGroup
          value={invoiceType}
          onValueChange={(v) => setInvoiceType(v as 'complete' | 'simplified')}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="complete" id="complete" />
            <Label htmlFor="complete" className="cursor-pointer">Completa</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="simplified" id="simplified" />
            <Label htmlFor="simplified" className="cursor-pointer">Simplificada</Label>
          </div>
        </RadioGroup>

        <Separator />

        {/* Receptor & Emisor Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Receptor (Patient) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Receptor
              </h4>
              {!editingPatient && invoiceType === 'complete' && missingFields.length > 0 && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="h-auto p-0 text-xs"
                  onClick={() => setEditingPatient(true)}
                >
                  Editar información
                </Button>
              )}
            </div>
            
            {editingPatient ? (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="space-y-2">
                  <Label className={cn(missingFields.includes('tax_id') && 'text-destructive')}>
                    NIF/CIF {invoiceType === 'complete' && '*'}
                  </Label>
                  <Input
                    value={patientFormData.tax_id}
                    onChange={(e) => setPatientFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                    placeholder="Ej: 12345678A"
                  />
                </div>
                <div className="space-y-2">
                  <Label className={cn(missingFields.includes('address') && 'text-destructive')}>
                    Dirección {invoiceType === 'complete' && '*'}
                  </Label>
                  <Input
                    value={patientFormData.address}
                    onChange={(e) => setPatientFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Calle y número"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className={cn(missingFields.includes('city') && 'text-destructive')}>
                      Ciudad {invoiceType === 'complete' && '*'}
                    </Label>
                    <Input
                      value={patientFormData.city}
                      onChange={(e) => setPatientFormData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="Ciudad"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={cn(missingFields.includes('postal_code') && 'text-destructive')}>
                      C.P. {invoiceType === 'complete' && '*'}
                    </Label>
                    <Input
                      value={patientFormData.postal_code}
                      onChange={(e) => setPatientFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                      placeholder="C.P."
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSavePatientData} disabled={savingPatient}>
                    {savingPatient ? 'Guardando...' : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingPatient(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{patientName}</p>
                <div className={cn(
                  "flex items-center gap-1",
                  invoiceType === 'complete' && !patientFormData.tax_id && "text-destructive"
                )}>
                  {invoiceType === 'complete' && !patientFormData.tax_id && (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  <span>NIF: {patientFormData.tax_id || 'Sin especificar'}</span>
                </div>
                {patientData.email && <p className="text-muted-foreground">{patientData.email}</p>}
                <div className={cn(
                  "flex items-center gap-1",
                  invoiceType === 'complete' && (!patientFormData.address || !patientFormData.city || !patientFormData.postal_code) && "text-destructive"
                )}>
                  {invoiceType === 'complete' && (!patientFormData.address || !patientFormData.city || !patientFormData.postal_code) && (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  <span>
                    {patientFormData.address 
                      ? `${patientFormData.address}, ${patientFormData.city} ${patientFormData.postal_code}`
                      : 'Dirección sin especificar'
                    }
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Emisor (Center) */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Emisor
            </h4>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">{center?.name}</p>
              <p>NIF: {center?.tax_id || 'Sin especificar'}</p>
              {center?.address && (
                <p className="text-muted-foreground">
                  {center.address}
                  {center.address_details && `, ${center.address_details}`}
                </p>
              )}
              {(center?.city || center?.postal_code) && (
                <p className="text-muted-foreground">
                  {center.city}{center.postal_code && `, ${center.postal_code}`}
                </p>
              )}
              {center?.country && (
                <p className="text-muted-foreground">{center.country}</p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Series Selection */}
        <div className="space-y-3">
          <h4 className="font-medium">Serie de facturación</h4>
          <p className="text-xs text-muted-foreground">
            Los borradores se crean sin número y sin fecha de emisión.
            Cuando conviertas esta factura a definitiva podrás escoger su fecha.
          </p>
          {availableSeries.length > 0 ? (
            <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una serie" />
              </SelectTrigger>
              <SelectContent>
                {availableSeries.map((series) => (
                  <SelectItem key={series.id} value={series.id}>
                    <span className="flex items-center gap-2">
                      {series.name}
                      {series.is_default && (
                        <span className="text-xs text-muted-foreground">(por defecto)</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No hay series de facturación disponibles para el tipo seleccionado.
                Crea una en Configuración → Facturación.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Invoice Items */}
        <div className="space-y-3">
          <h4 className="font-medium">Ítems</h4>
          
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 font-medium">
            <div className="col-span-5">Concepto</div>
            <div className="col-span-2 text-right">Precio</div>
            <div className="col-span-2 text-center">Cant.</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1"></div>
          </div>

          {/* Items List */}
          <div className="space-y-2">
            {items.map(item => (
              editingItemId === item.id ? (
                // Edit Mode
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border bg-muted/30">
                  <div className="col-span-5">
                    <Input
                      value={editItemData.description}
                      onChange={(e) => setEditItemData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Concepto"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editItemData.unitPrice}
                      onChange={(e) => setEditItemData(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                      className="h-8 text-sm text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="1"
                      value={editItemData.quantity}
                      onChange={(e) => setEditItemData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                      className="h-8 text-sm text-center"
                    />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">
                    {(editItemData.unitPrice * editItemData.quantity).toFixed(2)}€
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary"
                      onClick={() => handleUpdateItem(item.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingItemId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border bg-muted/30 group">
                  <div className="col-span-5 text-sm truncate" title={item.description}>
                    {item.description}
                  </div>
                  <div className="col-span-2 text-sm text-right">
                    {item.unitPrice.toFixed(2)}€
                  </div>
                  <div className="col-span-2 text-sm text-center">
                    {item.quantity}
                  </div>
                  <div className="col-span-2 text-sm text-right font-medium">
                    {item.total.toFixed(2)}€
                  </div>
                  <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleStartEditItem(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            ))}

            {/* Add New Item Form */}
            {addingItem && (
              <div className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-dashed bg-muted/20">
                <div className="col-span-5">
                  <Input
                    value={newItem.description}
                    onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Concepto"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItem.unitPrice}
                    onChange={(e) => setNewItem(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="h-8 text-sm text-right"
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    className="h-8 text-sm text-center"
                  />
                </div>
                <div className="col-span-2 text-right text-sm font-medium">
                  {(newItem.unitPrice * newItem.quantity).toFixed(2)}€
                </div>
                <div className="col-span-1 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary"
                    onClick={handleAddItem}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setAddingItem(false);
                      setNewItem({ description: '', unitPrice: 0, quantity: 1 });
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Add Item Button */}
          {!addingItem && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-primary"
              onClick={() => setAddingItem(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Añadir ítem
            </Button>
          )}
          
          {/* Totals */}
          <div className="space-y-1 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span>Base imponible</span>
              <span>{subtotal.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{taxName} ({taxRate}%{taxRate === 0 ? ' - Exento' : ''})</span>
              <span>{taxAmount.toFixed(2)}€</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{total.toFixed(2)}€</span>
            </div>
          </div>
        </div>

        {/* Missing Data Warning */}
        {invoiceType === 'complete' && missingFields.length > 0 && !editingPatient && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Para crear una factura completa se requieren los datos fiscales del paciente.
              <Button 
                variant="link" 
                className="h-auto p-0 ml-1 text-destructive"
                onClick={() => setEditingPatient(true)}
              >
                Completar datos →
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCreateInvoice}
            disabled={!canCreateInvoice || !selectedSeriesId || createInvoice.isPending}
          >
            {createInvoice.isPending ? 'Creando...' : 'Crear factura'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

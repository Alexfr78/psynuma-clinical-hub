import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, AlertTriangle, Building2, User, Pencil, Trash2, Plus, Check, X, ShieldCheck, Loader2, FlaskConical, CalendarIcon } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCenter } from '@/hooks/useCenter';
import { useInvoiceSeries } from '@/hooks/useInvoiceSeries';
import { useCreateInvoiceWithSeries } from '@/hooks/useInvoices';
import { usePatients, useUpdatePatient, usePatient } from '@/hooks/usePatients';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreateSimpleInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPatientId?: string;
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
  taxRate: number;
  taxName: string;
  retentionRate: number;
  retentionName: string;
  subtotal: number;
  taxAmount: number;
  retentionAmount: number;
  total: number;
}

// Tax type options (Spain)
const TAX_OPTIONS = [
  { value: 0, label: '0% - Exento', name: 'IVA Exento' },
  { value: 4, label: '4% - Superreducido', name: 'IVA' },
  { value: 10, label: '10% - Reducido', name: 'IVA' },
  { value: 21, label: '21% - General', name: 'IVA' },
];

// Retention options (IRPF Spain)
const RETENTION_OPTIONS = [
  { value: 0, label: 'Sin retención' },
  { value: 7, label: '7% IRPF' },
  { value: 15, label: '15% IRPF' },
];

function calculateLineItem(
  unitPrice: number,
  quantity: number,
  taxRate: number,
  retentionRate: number
): { subtotal: number; taxAmount: number; retentionAmount: number; total: number } {
  const subtotal = unitPrice * quantity;
  const taxAmount = subtotal * (taxRate / 100);
  const retentionAmount = subtotal * (retentionRate / 100);
  const total = subtotal + taxAmount - retentionAmount;
  return { subtotal, taxAmount, retentionAmount, total };
}

export function CreateSimpleInvoiceDialog({ open, onOpenChange, preselectedPatientId }: CreateSimpleInvoiceDialogProps) {
  const { center } = useCenter();
  const { ordinarySeries } = useInvoiceSeries();
  const createInvoice = useCreateInvoiceWithSeries();
  const updatePatient = useUpdatePatient();
  const { data: patients } = usePatients();
  
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId || '');
  const { data: patientData } = usePatient(selectedPatientId || undefined);
  
  const [invoiceType, setInvoiceType] = useState<'complete' | 'simplified'>('simplified');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [editingPatient, setEditingPatient] = useState(false);
  const [patientFormData, setPatientFormData] = useState<PatientFormData>({
    tax_id: '',
    address: '',
    city: '',
    postal_code: '',
  });
  const [savingPatient, setSavingPatient] = useState(false);
  const [isSigningVerifactu, setIsSigningVerifactu] = useState(false);
  const [notes, setNotes] = useState('');

  // Default tax and retention from center
  const defaultTaxRate = center?.default_tax_rate ?? 0;
  const defaultTaxName = defaultTaxRate === 0 ? 'IVA Exento' : (center?.default_tax_name ?? 'IVA');
  const defaultRetentionRate = center?.retention_rate ?? 0;
  const defaultRetentionName = center?.retention_name ?? 'IRPF';

  // Invoice items state
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    description: '',
    unitPrice: 0,
    quantity: 1,
    taxRate: defaultTaxRate,
    retentionRate: defaultRetentionRate,
  });
  const [editItemData, setEditItemData] = useState({
    description: '',
    unitPrice: 0,
    quantity: 1,
    taxRate: defaultTaxRate,
    retentionRate: defaultRetentionRate,
  });

  // Initialize with preselected patient
  useEffect(() => {
    if (preselectedPatientId) {
      setSelectedPatientId(preselectedPatientId);
    }
  }, [preselectedPatientId]);

  // Initialize items with default line when dialog opens
  useEffect(() => {
    if (open) {
      const calculated = calculateLineItem(60, 1, defaultTaxRate, defaultRetentionRate);
      setItems([{
        id: crypto.randomUUID(),
        description: 'Sesión de psicoterapia',
        unitPrice: 60,
        quantity: 1,
        taxRate: defaultTaxRate,
        taxName: defaultTaxName,
        retentionRate: defaultRetentionRate,
        retentionName: defaultRetentionName,
        ...calculated,
      }]);
      setEditingItemId(null);
      setAddingItem(false);
      setNewItem({
        description: '',
        unitPrice: 0,
        quantity: 1,
        taxRate: defaultTaxRate,
        retentionRate: defaultRetentionRate,
      });
    }
  }, [open, defaultTaxRate, defaultTaxName, defaultRetentionRate, defaultRetentionName]);

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
    } else {
      setPatientFormData({
        tax_id: '',
        address: '',
        city: '',
        postal_code: '',
      });
    }
  }, [patientData]);

  // Required fields for complete invoice
  const requiredFields = ['tax_id', 'address', 'city', 'postal_code'] as const;
  const missingFields = invoiceType === 'complete' 
    ? requiredFields.filter(field => !patientFormData[field])
    : [];
  
  const canCreateInvoice = selectedPatientId && (invoiceType === 'simplified' || missingFields.length === 0) && items.length > 0;

  // Calculate invoice totals from items
  const invoiceTotals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const retentionAmount = items.reduce((sum, item) => sum + item.retentionAmount, 0);
    const total = subtotal + taxAmount - retentionAmount;
    return { subtotal, taxAmount, retentionAmount, total };
  }, [items]);

  // Get tax name for a rate
  const getTaxLabel = (rate: number) => {
    const option = TAX_OPTIONS.find(o => o.value === rate);
    return option?.label || `${rate}%`;
  };

  // Get retention label
  const getRetentionLabel = (rate: number) => {
    if (rate === 0) return 'Sin retención';
    return `${rate}% IRPF`;
  };

  // Item management functions
  const handleAddItem = () => {
    if (!newItem.description.trim()) {
      toast.error('El concepto es obligatorio');
      return;
    }
    const calculated = calculateLineItem(
      newItem.unitPrice,
      newItem.quantity,
      newItem.taxRate,
      newItem.retentionRate
    );
    const taxOption = TAX_OPTIONS.find(o => o.value === newItem.taxRate);
    
    setItems([...items, {
      id: crypto.randomUUID(),
      description: newItem.description,
      unitPrice: newItem.unitPrice,
      quantity: newItem.quantity,
      taxRate: newItem.taxRate,
      taxName: taxOption?.name || 'IVA',
      retentionRate: newItem.retentionRate,
      retentionName: 'IRPF',
      ...calculated,
    }]);
    setAddingItem(false);
    setNewItem({
      description: '',
      unitPrice: 0,
      quantity: 1,
      taxRate: defaultTaxRate,
      retentionRate: defaultRetentionRate,
    });
  };

  const handleStartEditItem = (item: InvoiceLineItem) => {
    setEditingItemId(item.id);
    setEditItemData({
      description: item.description,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      taxRate: item.taxRate,
      retentionRate: item.retentionRate,
    });
  };

  const handleUpdateItem = (itemId: string) => {
    if (!editItemData.description.trim()) {
      toast.error('El concepto es obligatorio');
      return;
    }
    const calculated = calculateLineItem(
      editItemData.unitPrice,
      editItemData.quantity,
      editItemData.taxRate,
      editItemData.retentionRate
    );
    const taxOption = TAX_OPTIONS.find(o => o.value === editItemData.taxRate);
    
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          description: editItemData.description,
          unitPrice: editItemData.unitPrice,
          quantity: editItemData.quantity,
          taxRate: editItemData.taxRate,
          taxName: taxOption?.name || 'IVA',
          retentionRate: editItemData.retentionRate,
          retentionName: 'IRPF',
          ...calculated,
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
      toast.success('Datos del contacto actualizados');
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
      const result = await createInvoice.mutateAsync({
        invoice: {
          patient_id: patientData.id,
          issue_date: format(issueDate, 'yyyy-MM-dd'),
          subtotal: invoiceTotals.subtotal,
          tax_rate: 0,
          tax_amount: invoiceTotals.taxAmount,
          retention_rate: 0,
          retention_amount: invoiceTotals.retentionAmount,
          total: invoiceTotals.total,
          status: 'issued',
          notes: notes.trim() || null,
        },
        items: items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          tax_rate: item.taxRate,
          tax_name: item.taxName,
          tax_amount: item.taxAmount,
          retention_rate: item.retentionRate,
          retention_name: item.retentionName,
          retention_amount: item.retentionAmount,
          total: item.total,
        })),
        seriesId: selectedSeriesId,
      });

      // Si Verifactu automático está activado Y hay certificado, firmar la factura
      const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;
      const hasCertificate = !!center?.verifactu_certificate_base64;

      if (verifactuAutoEnabled && hasCertificate) {
        setIsSigningVerifactu(true);
        try {
          const { data: verifactuData, error: verifactuError } = await supabase.functions.invoke('sign-invoice-verifactu', {
            body: { invoice_id: result.id }
          });
          
          if (verifactuError) {
            console.error('Error Verifactu:', verifactuError);
            await supabase.from('invoices').update({ 
              verifactu_pending: true, 
              verifactu_retry_count: 1 
            }).eq('id', result.id);
            toast.warning(`Factura ${result.invoice_number} emitida, pendiente de registro en AEAT. Se reintentará automáticamente.`);
          } else if (verifactuData?.aeat_unavailable) {
            toast.info(`Factura ${result.invoice_number} emitida. La Agencia Tributaria no está disponible temporalmente. Se reintentará automáticamente.`, {
              duration: 6000,
            });
          } else if (verifactuData?.success) {
            const isTestMode = center?.verifactu_environment === 'test';
            if (isTestMode) {
              toast.success(`Factura ${result.invoice_number} emitida y firmada (modo pruebas)`);
            } else {
              toast.success(`Factura ${result.invoice_number} emitida y registrada en AEAT`);
            }
          } else {
            await supabase.from('invoices').update({ 
              verifactu_pending: true, 
              verifactu_retry_count: 1 
            }).eq('id', result.id);
            toast.warning(`Factura ${result.invoice_number} emitida, pendiente de registro en AEAT.`);
          }
        } catch (verifactuError) {
          console.error('Error Verifactu:', verifactuError);
          await supabase.from('invoices').update({ 
            verifactu_pending: true, 
            verifactu_retry_count: 1 
          }).eq('id', result.id);
          toast.warning(`Factura ${result.invoice_number} emitida, pendiente de registro en AEAT. Se reintentará automáticamente.`);
        } finally {
          setIsSigningVerifactu(false);
        }
      } else {
        toast.success(`Factura ${result.invoice_number} emitida correctamente`);
      }

      onOpenChange(false);
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  const patientName = patientData ? `${patientData.first_name} ${patientData.last_name}` : '';
  const isTestMode = center?.verifactu_environment === 'test';

  return (
<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nueva factura
          </DialogTitle>
          <DialogDescription>
            Crea una factura simple o completa para un paciente.
          </DialogDescription>
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

        {/* Date and Patient Selection */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Fecha de emisión</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !issueDate && "text-muted-foreground"
                  )}
                >
                  {issueDate ? format(issueDate, "d 'de' MMMM yyyy", { locale: es }) : <span>Seleccionar fecha</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={issueDate}
                  onSelect={(date) => date && setIssueDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Contacto</Label>
            <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar contacto" />
              </SelectTrigger>
              <SelectContent>
                {patients?.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.first_name} {patient.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedPatientId && patientData && (
          <>
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
              {center?.verifactu_certificate_base64 ? (
                isTestMode ? (
                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                    <FlaskConical className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                      <strong>Modo pruebas:</strong> La factura se firmará pero NO se enviará a AEAT producción.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 dark:text-green-200">
                      La factura se emitirá y registrará automáticamente en AEAT con Verifactu.
                    </AlertDescription>
                  </Alert>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  La factura se emitirá con el siguiente número de la serie seleccionada.
                </p>
              )}
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
                <div className="col-span-4">Concepto</div>
                <div className="col-span-1 text-right">Precio</div>
                <div className="col-span-1 text-center">Cant.</div>
                <div className="col-span-2 text-center">IVA</div>
                <div className="col-span-2 text-center">Retención</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1"></div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {items.map(item => (
                  editingItemId === item.id ? (
                    // Edit Mode - Expanded
                    <div key={item.id} className="p-3 rounded-lg border bg-muted/30 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Concepto</Label>
                        <Input
                          value={editItemData.description}
                          onChange={(e) => setEditItemData(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Concepto"
                          className="h-8 text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Precio</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editItemData.unitPrice}
                            onChange={(e) => setEditItemData(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Cantidad</Label>
                          <Input
                            type="number"
                            min="1"
                            value={editItemData.quantity}
                            onChange={(e) => setEditItemData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Tipo IVA</Label>
                          <Select
                            value={String(editItemData.taxRate)}
                            onValueChange={(v) => setEditItemData(prev => ({ ...prev, taxRate: Number(v) }))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TAX_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={String(opt.value)}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Retención</Label>
                          <Select
                            value={String(editItemData.retentionRate)}
                            onValueChange={(v) => setEditItemData(prev => ({ ...prev, retentionRate: Number(v) }))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RETENTION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={String(opt.value)}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Line totals preview */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <div className="flex gap-4">
                          <span>Subtotal: {(editItemData.unitPrice * editItemData.quantity).toFixed(2)}€</span>
                          <span>IVA: {((editItemData.unitPrice * editItemData.quantity) * (editItemData.taxRate / 100)).toFixed(2)}€</span>
                          <span>Ret: -{((editItemData.unitPrice * editItemData.quantity) * (editItemData.retentionRate / 100)).toFixed(2)}€</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            Total: {calculateLineItem(editItemData.unitPrice, editItemData.quantity, editItemData.taxRate, editItemData.retentionRate).total.toFixed(2)}€
                          </span>
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
                    </div>
                  ) : (
                    // View Mode
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border bg-muted/30 group">
                      <div className="col-span-4 text-sm truncate" title={item.description}>
                        {item.description}
                      </div>
                      <div className="col-span-1 text-sm text-right">
                        {item.unitPrice.toFixed(2)}€
                      </div>
                      <div className="col-span-1 text-sm text-center">
                        {item.quantity}
                      </div>
                      <div className="col-span-2 text-xs text-center">
                        {getTaxLabel(item.taxRate)}
                      </div>
                      <div className="col-span-2 text-xs text-center">
                        {getRetentionLabel(item.retentionRate)}
                      </div>
                      <div className="col-span-1 text-sm text-right font-medium">
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
                  <div className="p-3 rounded-lg border border-dashed bg-muted/20 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Concepto</Label>
                      <Input
                        value={newItem.description}
                        onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Concepto"
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Precio</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newItem.unitPrice}
                          onChange={(e) => setNewItem(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Cantidad</Label>
                        <Input
                          type="number"
                          min="1"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo IVA</Label>
                        <Select
                          value={String(newItem.taxRate)}
                          onValueChange={(v) => setNewItem(prev => ({ ...prev, taxRate: Number(v) }))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={String(opt.value)}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Retención</Label>
                        <Select
                          value={String(newItem.retentionRate)}
                          onValueChange={(v) => setNewItem(prev => ({ ...prev, retentionRate: Number(v) }))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RETENTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={String(opt.value)}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Line totals preview */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                      <div className="flex gap-4">
                        <span>Subtotal: {(newItem.unitPrice * newItem.quantity).toFixed(2)}€</span>
                        <span>IVA: {((newItem.unitPrice * newItem.quantity) * (newItem.taxRate / 100)).toFixed(2)}€</span>
                        <span>Ret: -{((newItem.unitPrice * newItem.quantity) * (newItem.retentionRate / 100)).toFixed(2)}€</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          Total: {calculateLineItem(newItem.unitPrice, newItem.quantity, newItem.taxRate, newItem.retentionRate).total.toFixed(2)}€
                        </span>
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
                            setNewItem({
                              description: '',
                              unitPrice: 0,
                              quantity: 1,
                              taxRate: defaultTaxRate,
                              retentionRate: defaultRetentionRate,
                            });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
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
                  <span>{invoiceTotals.subtotal.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA</span>
                  <span>{invoiceTotals.taxAmount.toFixed(2)}€</span>
                </div>
                {invoiceTotals.retentionAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Retención IRPF</span>
                    <span>-{invoiceTotals.retentionAmount.toFixed(2)}€</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{invoiceTotals.total.toFixed(2)}€</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observaciones (opcional)</Label>
              <Textarea
                placeholder="Notas u observaciones para la factura..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
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
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCreateInvoice}
            disabled={!canCreateInvoice || !selectedSeriesId || createInvoice.isPending || isSigningVerifactu}
          >
            {createInvoice.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando...
              </>
            ) : isSigningVerifactu ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Firmando con Verifactu...
              </>
            ) : (
              <>
                {center?.verifactu_certificate_base64 && (
                  isTestMode ? <FlaskConical className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Emitir factura
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

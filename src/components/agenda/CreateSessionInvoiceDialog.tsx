import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, AlertTriangle, Building2, User, Pencil, Trash2, Plus, Check, X, ShieldCheck, Loader2, FlaskConical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { cn } from '@/lib/utils';
import { useCenter } from '@/hooks/useCenter';
import { useInvoiceSeries } from '@/hooks/useInvoiceSeries';
import { useCreateInvoiceWithSeries } from '@/hooks/useInvoices';
import { useUpdatePatient, usePatient } from '@/hooks/usePatients';
import { SessionWithRelations } from '@/hooks/useSessions';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreatedInvoice {
  id: string;
  invoice_number: string;
  total: number;
}

interface CreateSessionInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionWithRelations;
  onSuccess?: (invoice: CreatedInvoice) => void;
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
  // Calculated fields
  subtotal: number;
  taxAmount: number;
  retentionAmount: number;
  total: number;
  sessionId?: string;
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

export function CreateSessionInvoiceDialog({
  open,
  onOpenChange,
  session,
  onSuccess,
}: CreateSessionInvoiceDialogProps) {
  const isMobile = useIsMobile();
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

  // Initialize items with session data
  useEffect(() => {
    if (session && open) {
      const sessionDateFormatted = format(new Date(session.session_date), "d 'de' MMMM yyyy", { locale: es });
      const price = Number(session.price) || 0;
      const calculated = calculateLineItem(price, 1, defaultTaxRate, defaultRetentionRate);
      
      setItems([{
        id: crypto.randomUUID(),
        description: `Sesión de psicoterapia - ${sessionDateFormatted}`,
        unitPrice: price,
        quantity: 1,
        taxRate: defaultTaxRate,
        taxName: defaultTaxName,
        retentionRate: defaultRetentionRate,
        retentionName: defaultRetentionName,
        ...calculated,
        sessionId: session.id,
      }]);
      // Reset other states
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
  }, [session, open, defaultTaxRate, defaultTaxName, defaultRetentionRate, defaultRetentionName]);

  // Filter series by invoice type
  const availableSeries = ordinarySeries.filter(
    s => s.invoice_type === invoiceType && !s.is_archived
  );

  // Set default series when type changes or series are loaded
  useEffect(() => {
    const compatibleSeries = ordinarySeries.filter(
      s => s.invoice_type === invoiceType && !s.is_archived
    );
    const defaultSeries = compatibleSeries.find(s => s.is_default);
    if (defaultSeries) {
      setSelectedSeriesId(defaultSeries.id);
    } else if (compatibleSeries.length === 1) {
      setSelectedSeriesId(compatibleSeries[0].id);
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
      // First, create or get billable event for the session
      let billableEventId: string | null = null;
      const sessionItem = items.find(item => item.sessionId);
      
      if (sessionItem?.sessionId) {
        // Check if billable event already exists
        const { data: existingEvent } = await supabase
          .from('billable_events')
          .select('id')
          .eq('session_id', sessionItem.sessionId)
          .maybeSingle();

        if (existingEvent) {
          billableEventId = existingEvent.id;
        } else {
          // Create new billable event
          const { data: newEvent, error: beError } = await supabase
            .from('billable_events')
            .insert({
              center_id: center!.id,
              session_id: sessionItem.sessionId,
              patient_id: patientData.id,
              concept: sessionItem.description,
              amount: sessionItem.unitPrice,
              billing_status: 'pending',
            })
            .select()
            .single();

          if (beError) throw beError;
          billableEventId = newEvent.id;
        }
      }

      const result = await createInvoice.mutateAsync({
        invoice: {
          patient_id: patientData.id,
          invoice_type: invoiceType,
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
          session_id: item.sessionId || null,
          billable_event_id: billableEventId,
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
            // Marcar como pendiente para reintento automático
            await supabase.from('invoices').update({ 
              verifactu_pending: true, 
              verifactu_retry_count: 1 
            }).eq('id', result.id);
            toast.warning(`Factura ${result.invoice_number} emitida, pendiente de registro en AEAT. Se reintentará automáticamente.`);
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
      onSuccess?.({
        id: result.id,
        invoice_number: result.invoice_number,
        total: invoiceTotals.total,
      });
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  if (!patientData) return null;

  const patientName = `${patientData.first_name} ${patientData.last_name}`;

  const formContent = (
    <div className="space-y-4">
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
                    placeholder="Código postal"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingPatient(false);
                    // Reset to original values
                    setPatientFormData({
                      tax_id: patientData?.tax_id || '',
                      address: patientData?.address || '',
                      city: patientData?.city || '',
                      postal_code: patientData?.postal_code || '',
                    });
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSavePatientData}
                  disabled={savingPatient}
                >
                  {savingPatient ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <p className="font-medium">{patientName}</p>
              <p className={cn(!patientData?.tax_id && invoiceType === 'complete' && 'text-destructive')}>
                NIF: {patientData?.tax_id || 'Sin especificar'}
              </p>
              <p className={cn(
                (!patientData?.address || !patientData?.city || !patientData?.postal_code) && 
                invoiceType === 'complete' && 'text-destructive'
              )}>
                {patientData?.address && patientData?.city 
                  ? `${patientData.address}, ${patientData.city} ${patientData.postal_code || ''}`
                  : 'Dirección sin especificar'
                }
              </p>
            </div>
          )}
        </div>

        {/* Emisor (Center) */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Emisor
          </h4>
          <div className="text-sm space-y-1">
            <p className="font-medium">{center?.name}</p>
            <p>NIF: {center?.tax_id || 'Sin especificar'}</p>
            {center?.address && (
              <p className="text-muted-foreground">{center.address}</p>
            )}
            {(center?.city || center?.postal_code) && (
              <p className="text-muted-foreground">
                {center.city}{center.postal_code ? `, ${center.postal_code}` : ''}
              </p>
            )}
            {center?.country && (
              <p className="text-muted-foreground">{center.country}</p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Billing Series */}
      <div className="space-y-3">
        <h4 className="font-medium">Serie de facturación</h4>
        
        {center?.verifactu_certificate_base64 && (
          <Alert variant={center?.verifactu_environment === 'test' ? 'default' : 'default'} className={cn(
            'border py-2',
            center?.verifactu_environment === 'test' 
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-green-50 border-green-200 text-green-800'
          )}>
            <AlertDescription className="flex items-center gap-2 text-sm">
              {center?.verifactu_environment === 'test' ? (
                <>
                  <FlaskConical className="h-4 w-4 flex-shrink-0" />
                  <span><strong>Modo pruebas:</strong> La factura se firmará pero NO se enviará a AEAT producción.</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                  <span><strong>Verifactu activo:</strong> La factura se firmará y enviará a la AEAT.</span>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        
        {!selectedSeriesId && availableSeries.length > 1 && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              Hay varias series compatibles sin una predeterminada. Selecciona una para esta factura o configura la predeterminada en Ajustes.
            </AlertDescription>
          </Alert>
        )}

        {availableSeries.length === 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No hay una serie activa para este tipo de factura. Créala en Ajustes → Facturación → Series de facturas.
            </AlertDescription>
          </Alert>
        )}

        <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId} disabled={availableSeries.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar serie" />
          </SelectTrigger>
          <SelectContent className="z-[200]" position="popper" sideOffset={4}>
            {availableSeries.map((series) => (
              <SelectItem key={series.id} value={series.id}>
                {series.name} {series.is_default && '(por defecto)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Invoice Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Ítems</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddItem}
          >
            <Plus className="h-4 w-4 mr-1" />
            Añadir ítem
          </Button>
        </div>
        
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg p-3 space-y-3 bg-muted/20">
              {editingItemId === item.id ? (
                // Editing mode
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input
                      value={editItemData.description}
                      onChange={(e) => setEditItemData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descripción del servicio"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Cantidad</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editItemData.quantity}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 1;
                          setEditItemData(prev => ({ ...prev, quantity: qty }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Precio unitario (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={editItemData.unitPrice}
                        onChange={(e) => {
                          const price = parseFloat(e.target.value) || 0;
                          setEditItemData(prev => ({ ...prev, unitPrice: price }));
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>IVA</Label>
                      <Select
                        value={String(editItemData.taxRate)}
                        onValueChange={(v) => {
                          const rate = parseInt(v);
                          setEditItemData(prev => ({ ...prev, taxRate: rate }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[200]" position="popper" sideOffset={4}>
                          {TAX_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>IRPF</Label>
                      <Select
                        value={String(editItemData.retentionRate)}
                        onValueChange={(v) => {
                          const rate = parseInt(v);
                          setEditItemData(prev => ({ ...prev, retentionRate: rate }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[200]" position="popper" sideOffset={4}>
                          {RETENTION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)}>
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={() => handleUpdateItem(item.id)}>
                      <Check className="h-4 w-4 mr-1" />
                      Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                // Display mode
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} x {item.unitPrice.toFixed(2)}€ = {item.subtotal.toFixed(2)}€
                      {item.taxRate > 0 && ` + ${item.taxAmount.toFixed(2)}€ IVA (${item.taxRate}%)`}
                      {item.retentionRate > 0 && ` - ${item.retentionAmount.toFixed(2)}€ IRPF (${item.retentionRate}%)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium mr-2">{item.total.toFixed(2)}€</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleStartEditItem(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Totals */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span>Base imponible:</span>
          <span>{invoiceTotals.subtotal.toFixed(2)}€</span>
        </div>
        {invoiceTotals.taxAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span>IVA:</span>
            <span>+{invoiceTotals.taxAmount.toFixed(2)}€</span>
          </div>
        )}
        {invoiceTotals.retentionAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span>Retención IRPF:</span>
            <span>-{invoiceTotals.retentionAmount.toFixed(2)}€</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-medium text-lg">
          <span>Total:</span>
          <span>{invoiceTotals.total.toFixed(2)}€</span>
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

      {/* Missing Fields Warning */}
      {invoiceType === 'complete' && missingFields.length > 0 && !editingPatient && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Faltan datos fiscales del paciente para factura completa.</span>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-destructive"
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
                center?.verifactu_environment === 'test' 
                  ? <FlaskConical className="mr-2 h-4 w-4" /> 
                  : <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Emitir factura
            </>
          )}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95vh] max-h-[95vh] overflow-hidden">
          <DrawerHeader className="px-4 pt-4 pb-2 border-b">
            <div className="flex items-center justify-between gap-3">
              <DrawerTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Crear factura
              </DrawerTitle>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Crear factura
          </DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

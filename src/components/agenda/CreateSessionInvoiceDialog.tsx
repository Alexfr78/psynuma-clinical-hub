import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, AlertTriangle, Building2, User, Check } from 'lucide-react';
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
  
  const canCreateInvoice = invoiceType === 'simplified' || missingFields.length === 0;

  // Calculate amounts
  const taxRate = center?.default_tax_rate ?? 0;
  const taxName = center?.default_tax_name ?? 'IVA';
  const subtotal = Number(session.price) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

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
    if (!patientData || !selectedSeriesId) return;

    try {
      const sessionDateFormatted = format(new Date(session.session_date), "d 'de' MMMM yyyy", { locale: es });
      
      await createInvoice.mutateAsync({
        invoice: {
          patient_id: patientData.id,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          status: 'draft',
        },
        items: [{
          description: `Sesión de psicoterapia - ${sessionDateFormatted}`,
          quantity: 1,
          unit_price: subtotal,
          total: subtotal,
          session_id: session.id,
        }],
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

        {/* Invoice Summary */}
        <div className="space-y-3">
          <h4 className="font-medium">Concepto</h4>
          <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                Sesión de psicoterapia - {format(new Date(session.session_date), "d 'de' MMMM yyyy", { locale: es })}
              </span>
              <span className="font-medium">{subtotal.toFixed(2)}€</span>
            </div>
            <p className="text-xs text-muted-foreground">Cantidad: 1</p>
          </div>
          
          <div className="space-y-1 pt-2">
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

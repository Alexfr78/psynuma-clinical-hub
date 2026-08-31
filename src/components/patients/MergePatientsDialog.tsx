import { useState, useMemo } from 'react';
import { useProfessionals } from '@/hooks/useProfessionals';
import { useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

type PatientLinkedTable = keyof Database['public']['Tables'] & (
  | 'sessions' | 'invoices' | 'payments' | 'debts' | 'bonos'
  | 'assessments' | 'autoregistro_entries' | 'autoregistro_links'
  | 'emotional_records' | 'consents' | 'notifications' | 'recurring_series'
  | 'billable_events' | 'whatsapp_messages'
);
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PatientSelector } from '@/components/agenda/PatientSelector';
import { usePatient } from '@/hooks/usePatients';
import { Icon } from '@/components/ui/icon';

interface MergePatientsDialogProps {
  primaryPatientId: string;
  primaryPatientName: string;
  trigger?: React.ReactNode;
}

const MERGE_FIELDS = [
  { key: 'first_name', label: 'Nombre' },
  { key: 'last_name', label: 'Apellidos' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'date_of_birth', label: 'Fecha de nacimiento' },
  { key: 'gender', label: 'Género' },
  { key: 'tax_id', label: 'DNI/NIE' },
  { key: 'address', label: 'Dirección' },
  { key: 'city', label: 'Ciudad' },
  { key: 'postal_code', label: 'Código Postal' },
  { key: 'notes', label: 'Notas' },
  { key: 'is_minor', label: 'Menor de edad' },
  { key: 'guardian_name', label: 'Nombre del tutor' },
  { key: 'guardian_phone', label: 'Teléfono del tutor' },
  { key: 'guardian_email', label: 'Email del tutor' },
  { key: 'guardian_relationship', label: 'Relación del tutor' },
  { key: 'emergency_contact_name', label: 'Contacto de emergencia' },
  { key: 'emergency_contact_phone', label: 'Tel. emergencia' },
  { key: 'assigned_professional_id', label: 'Profesional asignado' },
  { key: 'status', label: 'Estado' },
  { key: 'auto_invoice_on_complete', label: 'Facturar al completar' },
] as const;

type Step = 'select' | 'resolve' | 'confirm';

export function MergePatientsDialog({ primaryPatientId, primaryPatientName, trigger }: MergePatientsDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [secondaryId, setSecondaryId] = useState<string | null>(null);
  const [resolvedFields, setResolvedFields] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [hasVerifactu, setHasVerifactu] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: primaryPatient } = usePatient(primaryPatientId);
  const { data: secondaryPatient } = usePatient(secondaryId || undefined);
  const { data: professionals } = useProfessionals();

  // Find conflicting fields
  const conflicts = useMemo(() => {
    if (!primaryPatient || !secondaryPatient) return [];
    return MERGE_FIELDS.filter(({ key }) => {
      const pVal = (primaryPatient as unknown as Record<string, unknown>)[key];
      const sVal = (secondaryPatient as unknown as Record<string, unknown>)[key];
      // Both have different non-empty values
      const pEmpty = pVal === null || pVal === undefined || pVal === '';
      const sEmpty = sVal === null || sVal === undefined || sVal === '';
      if (pEmpty && sEmpty) return false;
      if (pEmpty !== sEmpty) return false; // auto-resolved
      return String(pVal) !== String(sVal);
    });
  }, [primaryPatient, secondaryPatient]);

  // Auto-resolved: one has value, other doesn't
  const autoResolved = useMemo(() => {
    if (!primaryPatient || !secondaryPatient) return [];
    return MERGE_FIELDS.filter(({ key }) => {
      const pVal = (primaryPatient as unknown as Record<string, unknown>)[key];
      const sVal = (secondaryPatient as unknown as Record<string, unknown>)[key];
      const pEmpty = pVal === null || pVal === undefined || pVal === '';
      const sEmpty = sVal === null || sVal === undefined || sVal === '';
      return pEmpty !== sEmpty;
    });
  }, [primaryPatient, secondaryPatient]);

  // Initialize resolved fields with primary values by default
  const initializeResolutions = () => {
    const initial: Record<string, string> = {};
    conflicts.forEach(({ key }) => {
      initial[key] = 'primary';
    });
    // Auto-resolve fields where one has value, other doesn't
    autoResolved.forEach(({ key }) => {
      const pVal = (primaryPatient as unknown as Record<string, unknown>)[key];
      const pEmpty = pVal === null || pVal === undefined || pVal === '';
      initial[key] = pEmpty ? 'secondary' : 'primary';
    });
    setResolvedFields(initial);
  };

  const handleSelectSecondary = (patientId: string) => {
    if (patientId === primaryPatientId) {
      toast.error('No puedes fusionar un contacto consigo mismo');
      return;
    }
    setSecondaryId(patientId);
  };

  const handleNextToResolve = () => {
    initializeResolutions();
    setStep('resolve');
  };

  const handleNextToConfirm = async () => {
    // Fetch counts
    if (!secondaryId) return;
    try {
      const tables: PatientLinkedTable[] = [
        'sessions', 'invoices', 'payments', 'debts', 'bonos',
        'assessments', 'autoregistro_entries', 'autoregistro_links',
        'emotional_records', 'consents', 'notifications', 'recurring_series',
        'billable_events', 'whatsapp_messages',
      ];
      const countResults: Record<string, number> = {};
      
      const results = await Promise.all(
        tables.map(async (table) => {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('patient_id', secondaryId);
          return { table, count: count || 0 };
        })
      );
      
      results.forEach(({ table, count }) => {
        if (count > 0) countResults[table] = count;
      });
      setCounts(countResults);

      // Check verifactu
      const { count: vfCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', secondaryId)
        .not('verifactu_hash', 'is', null);
      setHasVerifactu((vfCount || 0) > 0);

      setStep('confirm');
    } catch {
      toast.error('Error al obtener los conteos de registros');
    }
  };

  const buildResolvedFieldsPayload = () => {
    if (!primaryPatient || !secondaryPatient) return {};
    const payload: Record<string, unknown> = {};
    
    [...conflicts, ...autoResolved].forEach(({ key }) => {
      const choice = resolvedFields[key];
      if (choice === 'secondary') {
        payload[key] = (secondaryPatient as unknown as Record<string, unknown>)[key];
      }
      // If 'primary', no need to send — primary already has it
    });

    return payload;
  };

  const handleExecuteMerge = async () => {
    if (!secondaryId) return;
    setIsExecuting(true);
    try {
      const { data, error } = await supabase.rpc('merge_patients', {
        p_primary_id: primaryPatientId,
        p_secondary_id: secondaryId,
        p_field_overrides: buildResolvedFieldsPayload() as Json,
      });

      if (error) throw error;

      toast.success('Contactos fusionados correctamente', {
        description: `Todos los datos han sido transferidos al contacto principal.`,
      });

      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient', primaryPatientId] });

      setOpen(false);
      resetState();
      navigate(`/pacientes/${primaryPatientId}`);
    } catch (err) {
      toast.error('Error al fusionar contactos', {
        description: (err as Error).message || 'Ha ocurrido un error inesperado.',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const resetState = () => {
    setStep('select');
    setSecondaryId(null);
    setResolvedFields({});
    setCounts(null);
    setHasVerifactu(false);
  };

  const formatValue = (val: unknown, key?: string): string => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    if (key === 'assigned_professional_id') {
      const prof = professionals?.find(p => p.id === val);
      return prof ? `${prof.first_name} ${prof.last_name}` : String(val);
    }
    return String(val);
  };

  const TABLE_LABELS: Record<string, string> = {
    sessions: 'Sesiones',
    invoices: 'Facturas',
    payments: 'Pagos',
    debts: 'Deudas',
    bonos: 'Bonos',
    assessments: 'Evaluaciones',
    autoregistro_entries: 'Autoregistros',
    autoregistro_links: 'Links de autoregistro',
    emotional_records: 'Registros emocionales',
    consents: 'Consentimientos',
    notifications: 'Notificaciones',
    recurring_series: 'Series recurrentes',
    billable_events: 'Eventos facturables',
    whatsapp_messages: 'Mensajes WhatsApp',
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Icon name="merge" className="mr-2 h-4 w-4" />
            Fusionar con duplicado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="merge" className="h-5 w-5" />
            Fusionar contactos
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Selecciona el contacto duplicado a fusionar.'}
            {step === 'resolve' && 'Resuelve los conflictos entre los datos de ambos contactos.'}
            {step === 'confirm' && 'Revisa el resumen y confirma la fusión.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {/* STEP 1: Select secondary patient */}
          {step === 'select' && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm font-medium">Contacto principal (se conserva)</p>
                <p className="text-lg font-semibold text-foreground">{primaryPatientName}</p>
              </div>

              <div className="space-y-2">
                <Label>Buscar contacto duplicado</Label>
                <PatientSelector
                  onSelect={handleSelectSecondary}
                />
              </div>

              {secondaryPatient && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">Contacto a eliminar</p>
                  <p className="text-lg font-semibold">
                    {secondaryPatient.first_name} {secondaryPatient.last_name}
                  </p>
                  {secondaryPatient.email && (
                    <p className="text-sm text-muted-foreground">{secondaryPatient.email}</p>
                  )}
                </div>
              )}

              <Alert variant="destructive">
                <Icon name="warning" className="h-4 w-4" />
                <AlertTitle>Acción irreversible</AlertTitle>
                <AlertDescription>
                  Todos los datos del contacto secundario se trasladarán al principal 
                  y el registro secundario será eliminado permanentemente.
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button
                  onClick={handleNextToResolve}
                  disabled={!secondaryPatient}
                >
                  Continuar
                  <Icon name="arrow_forward" className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Resolve conflicts */}
          {step === 'resolve' && primaryPatient && secondaryPatient && (
            <div className="space-y-4">
              {conflicts.length === 0 ? (
                <Alert>
                  <Icon name="check_circle" className="h-4 w-4" />
                  <AlertTitle>Sin conflictos</AlertTitle>
                  <AlertDescription>
                    No hay campos con valores diferentes. Los datos se fusionarán automáticamente.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Los siguientes campos tienen valores distintos. Elige cuál conservar:
                  </p>
                  {conflicts.map(({ key, label }) => {
                    const pVal = formatValue((primaryPatient as unknown as Record<string, unknown>)[key], key);
                    const sVal = formatValue((secondaryPatient as unknown as Record<string, unknown>)[key], key);
                    return (
                      <div key={key} className="rounded-lg border p-3 space-y-2">
                        <Label className="text-sm font-medium">{label}</Label>
                        <RadioGroup
                          value={resolvedFields[key] || 'primary'}
                          onValueChange={(v) => setResolvedFields(prev => ({ ...prev, [key]: v }))}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                        >
                          <div className="flex items-start space-x-2 rounded-md border p-2 hover:bg-muted/50">
                            <RadioGroupItem value="primary" id={`${key}-primary`} className="mt-0.5" />
                            <Label htmlFor={`${key}-primary`} className="cursor-pointer flex-1">
                              <span className="text-xs text-muted-foreground">Principal</span>
                              <p className="text-sm font-medium break-all">{pVal}</p>
                            </Label>
                          </div>
                          <div className="flex items-start space-x-2 rounded-md border p-2 hover:bg-muted/50">
                            <RadioGroupItem value="secondary" id={`${key}-secondary`} className="mt-0.5" />
                            <Label htmlFor={`${key}-secondary`} className="cursor-pointer flex-1">
                              <span className="text-xs text-muted-foreground">Secundario</span>
                              <p className="text-sm font-medium break-all">{sVal}</p>
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    );
                  })}
                </div>
              )}

              {autoResolved.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-medium">
                    Campos auto-resueltos ({autoResolved.length})
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {autoResolved.map(({ key, label }) => {
                      const pVal = (primaryPatient as unknown as Record<string, unknown>)[key];
                      const pEmpty = pVal === null || pVal === undefined || pVal === '';
                      const source = pEmpty ? 'secundario' : 'principal';
                      const val = pEmpty ? (secondaryPatient as unknown as Record<string, unknown>)[key] : pVal;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <Icon name="check_circle" className="h-3 w-3 text-green-500 shrink-0" />
                          <span>{label}: <strong>{formatValue(val, key)}</strong> (del {source})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('select')}>
                  Atrás
                </Button>
                <Button onClick={handleNextToConfirm}>
                  Continuar
                  <Icon name="arrow_forward" className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Se conserva</p>
                  <p className="font-semibold text-sm">{primaryPatientName}</p>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">Se elimina</p>
                  <p className="font-semibold text-sm">
                    {secondaryPatient?.first_name} {secondaryPatient?.last_name}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Records to transfer */}
              {counts && Object.keys(counts).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Registros a transferir:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(counts).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between rounded border p-2">
                        <span className="text-xs">{TABLE_LABELS[table] || table}</span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Alert>
                  <Icon name="info" className="h-4 w-4" />
                  <AlertDescription>
                    El contacto secundario no tiene registros asociados.
                  </AlertDescription>
                </Alert>
              )}

              {/* Field changes */}
              {Object.entries(resolvedFields).filter(([, v]) => v === 'secondary').length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Campos que se actualizarán del secundario:</p>
                  <div className="text-xs space-y-1">
                    {Object.entries(resolvedFields)
                      .filter(([, v]) => v === 'secondary')
                      .map(([key]) => {
                        const field = MERGE_FIELDS.find(f => f.key === key);
                        const val = secondaryPatient ? formatValue((secondaryPatient as unknown as Record<string, unknown>)[key], key) : '—';
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <Icon name="arrow_forward" className="h-3 w-3 text-primary shrink-0" />
                            <span>{field?.label}: <strong>{val}</strong></span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Verifactu warning */}
              {hasVerifactu && (
                <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <Icon name="warning" className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-700 dark:text-amber-400">
                    Facturas firmadas ante la AEAT
                  </AlertTitle>
                  <AlertDescription className="text-amber-600 dark:text-amber-300 text-xs">
                    El contacto secundario tiene facturas ya registradas en VeriFactu. 
                    Se reasignarán al contacto principal pero los datos del receptor 
                    en el XML original no se modifican.
                  </AlertDescription>
                </Alert>
              )}

              <Alert variant="destructive">
                <Icon name="warning" className="h-4 w-4" />
                <AlertTitle>Confirmar fusión irreversible</AlertTitle>
                <AlertDescription>
                  Esta acción no se puede deshacer. Se eliminarán todos los datos del 
                  contacto secundario tras transferirlos.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('resolve')} disabled={isExecuting}>
                  Atrás
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleExecuteMerge}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <>
                      <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                      Fusionando...
                    </>
                  ) : (
                    <>
                      <Icon name="merge" className="mr-2 h-4 w-4" />
                      Confirmar fusión
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useCreateScheduleException, useConflictingSessions } from '@/hooks/useScheduleExceptions';
import { ScheduleException } from '@/lib/schedule-exceptions';
import { useToast } from '@/hooks/use-toast';

const REASON_OPTIONS = [
  { value: 'holiday', label: 'Festivo' },
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'sick_leave', label: 'Baja médica' },
  { value: 'training', label: 'Formación' },
  { value: 'closure', label: 'Cierre' },
  { value: 'other', label: 'Otro' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDates: string[]; // sorted yyyy-MM-dd
  centerId: string;
  professionals: Array<{ id: string; first_name: string | null; last_name: string | null }> | undefined;
  existingExceptions: ScheduleException[];
  onComplete: () => void;
}

export function BatchExceptionDialog({
  open,
  onOpenChange,
  selectedDates,
  centerId,
  professionals,
  existingExceptions,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const createException = useCreateScheduleException();

  const [scope, setScope] = useState<'center' | 'professional'>('center');
  const [professionalId, setProfessionalId] = useState('');
  const [reasonType, setReasonType] = useState('holiday');
  const [reasonLabel, setReasonLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [affectsBooking, setAffectsBooking] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check for conflicts across all selected dates
  const minDate = selectedDates[0];
  const maxDate = selectedDates[selectedDates.length - 1];
  const { data: conflictingSessions } = useConflictingSessions(
    centerId,
    minDate,
    maxDate,
    scope === 'professional' ? professionalId : undefined,
    open && selectedDates.length > 0
  );

  // Group consecutive dates into ranges for efficient storage
  const groupIntoRanges = (dates: string[]): Array<[string, string]> => {
    if (dates.length === 0) return [];
    const ranges: Array<[string, string]> = [];
    let rangeStart = dates[0];
    let prev = dates[0];

    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(prev + 'T00:00:00');
      const currDate = new Date(dates[i] + 'T00:00:00');
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        prev = dates[i];
      } else {
        ranges.push([rangeStart, prev]);
        rangeStart = dates[i];
        prev = dates[i];
      }
    }
    ranges.push([rangeStart, prev]);
    return ranges;
  };

  // Check for duplicates
  const duplicateDates = selectedDates.filter(dateKey => {
    const existing = existingExceptions.filter(exc => {
      if (dateKey < exc.start_date || dateKey > exc.end_date) return false;
      if (scope === 'center') return exc.scope === 'center';
      return exc.scope === 'professional' && exc.professional_id === professionalId;
    });
    return existing.length > 0;
  });

  const handleSave = async () => {
    if (scope === 'professional' && !professionalId) {
      toast({ title: 'Selecciona un profesional', variant: 'destructive' });
      return;
    }

    // Filter out dates that would be exact duplicates
    const datesToSave = selectedDates.filter(d => !duplicateDates.includes(d));
    if (datesToSave.length === 0) {
      toast({ title: 'Todos los días seleccionados ya tienen bloqueos equivalentes', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const ranges = groupIntoRanges(datesToSave);
      for (const [start, end] of ranges) {
        await createException.mutateAsync({
          center_id: centerId,
          scope,
          professional_id: scope === 'professional' ? professionalId : null,
          start_date: start,
          end_date: end,
          all_day: true,
          start_time: null,
          end_time: null,
          reason_type: reasonType as ScheduleException['reason_type'],
          reason_label: reasonLabel || null,
          notes: notes || null,
          affects_booking: affectsBooking,
          created_by: user?.id || null,
        });
      }
      toast({
        title: 'Bloqueos creados',
        description: `${datesToSave.length} día${datesToSave.length > 1 ? 's' : ''} bloqueado${datesToSave.length > 1 ? 's' : ''} en ${ranges.length} registro${ranges.length > 1 ? 's' : ''}.`,
      });
      onComplete();
    } catch {
      toast({ title: 'Error al crear bloqueos', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return format(d, "d MMM", { locale: es });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear bloqueo masivo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          {/* Selected dates preview */}
          <div>
            <Label className="text-xs text-muted-foreground">Días seleccionados</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedDates.slice(0, 12).map(d => (
                <Badge key={d} variant="secondary" className="text-xs">
                  {formatDateDisplay(d)}
                </Badge>
              ))}
              {selectedDates.length > 12 && (
                <Badge variant="outline" className="text-xs">
                  +{selectedDates.length - 12} más
                </Badge>
              )}
            </div>
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label>Alcance</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'center' | 'professional')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Todo el centro</SelectItem>
                <SelectItem value="professional">Profesional específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'professional' && (
            <div className="space-y-1.5">
              <Label>Profesional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {professionals?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Etiqueta personalizada (opcional)</Label>
            <Input
              placeholder="Ej: Puente de diciembre"
              value={reasonLabel}
              onChange={e => setReasonLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas internas (opcional)</Label>
            <Textarea
              placeholder="Notas..."
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Bloquear nuevas citas</Label>
              <p className="text-xs text-muted-foreground">Impide agendar citas en estos días</p>
            </div>
            <Switch checked={affectsBooking} onCheckedChange={setAffectsBooking} />
          </div>

          {/* Duplicate warning */}
          {duplicateDates.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {duplicateDates.length} día{duplicateDates.length > 1 ? 's' : ''} ya tiene{duplicateDates.length === 1 ? '' : 'n'} bloqueo equivalente y se omitirá{duplicateDates.length > 1 ? 'n' : ''}.
              </AlertDescription>
            </Alert>
          )}

          {/* Conflict warning */}
          {conflictingSessions && conflictingSessions.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1 text-xs">Hay {conflictingSessions.length} cita(s) en este rango:</p>
                <ul className="text-xs space-y-0.5 max-h-20 overflow-y-auto">
                  {conflictingSessions.slice(0, 5).map((s: any) => (
                    <li key={s.id}>
                      {s.session_date} {s.start_time?.slice(0, 5)} — {s.patient?.first_name} {s.patient?.last_name}
                    </li>
                  ))}
                  {conflictingSessions.length > 5 && <li>...y {conflictingSessions.length - 5} más</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Crear {selectedDates.length - duplicateDates.length} bloqueo{(selectedDates.length - duplicateDates.length) !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

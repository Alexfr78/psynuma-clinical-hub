import { useState, useEffect } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SessionWithRelations } from '@/hooks/useSessions';
import { useAuth } from '@/hooks/useAuth';
import { checkSessionConflicts, ConflictResult } from '@/lib/conflicts';
import { ConflictsDialog } from './ConflictsDialog';
import { Icon } from '@/components/ui/icon';

interface MoveSessionDialogProps {
  session: SessionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => Promise<void>;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00
const MINUTES = ['00', '15', '30', '45'];

export function MoveSessionDialog({ session, open, onOpenChange, onMove }: MoveSessionDialogProps) {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [isMoving, setIsMoving] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictResult[]>([]);
  const [showConflictsDialog, setShowConflictsDialog] = useState(false);

  // Initialize with session data when dialog opens
  useEffect(() => {
    if (session && open) {
      setSelectedDate(new Date(session.session_date));
      const [h, m] = (session.start_time || '09:00').split(':');
      setSelectedHour(h);
      setSelectedMinute(m === '00' || m === '15' || m === '30' || m === '45' ? m : '00');
      setConflicts([]);
      setShowConflictsDialog(false);
    }
  }, [session, open]);

  if (!session) return null;

  const computeNewTimes = () => {
    const newStartTime = `${selectedHour}:${selectedMinute}`;
    const [origStartH, origStartM] = (session.start_time || '09:00').split(':').map(Number);
    const [origEndH, origEndM] = (session.end_time || '10:00').split(':').map(Number);
    const durationMinutes = (origEndH * 60 + origEndM) - (origStartH * 60 + origStartM);
    const newStartMinutes = parseInt(selectedHour) * 60 + parseInt(selectedMinute);
    const newEndMinutes = newStartMinutes + durationMinutes;
    const newEndTime = `${Math.floor(newEndMinutes / 60).toString().padStart(2, '0')}:${(newEndMinutes % 60).toString().padStart(2, '0')}`;
    const newDate = format(selectedDate, 'yyyy-MM-dd');
    return { newDate, newStartTime, newEndTime, durationMinutes };
  };

  const executeMove = async () => {
    const { newDate, newStartTime, newEndTime } = computeNewTimes();
    setIsMoving(true);
    try {
      await onMove(session.id, newDate, newStartTime, newEndTime);
      onOpenChange(false);
    } finally {
      setIsMoving(false);
    }
  };

  const handleMove = async () => {
    const { newDate, newStartTime, newEndTime } = computeNewTimes();
    const professionalId = session.professional_id;
    const centerId = profile?.center_id;

    if (!centerId || !professionalId) {
      await executeMove();
      return;
    }

    setIsCheckingConflicts(true);
    try {
      const start = new Date(`${newDate}T${newStartTime}`);
      const end = new Date(`${newDate}T${newEndTime}`);

      const results = await checkSessionConflicts({
        centerId,
        professionalId,
        sessionsToCheck: [{ start, end }],
        excludeSessionId: session.id,
      });

      if (results.length > 0) {
        setConflicts(results);
        setShowConflictsDialog(true);
      } else {
        await executeMove();
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
      // If conflict check fails, proceed anyway
      await executeMove();
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const patientName = session.patient 
    ? `${session.patient.first_name} ${session.patient.last_name}` 
    : 'Sin contacto';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="schedule" className="h-5 w-5" />
              Mover sesión
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Session info */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">{patientName}</p>
              <p className="text-muted-foreground">
                Actualmente: {format(new Date(session.session_date), 'EEEE d MMMM', { locale: es })} a las {session.start_time?.slice(0, 5)}
              </p>
            </div>

            {/* Date selector */}
            <div className="space-y-2">
              <Label>Nueva fecha</Label>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setSelectedDate(d => subDays(d, 1))}
                >
                  <Icon name="chevron_left" className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <div className="font-medium">
                    {format(selectedDate, 'EEEE', { locale: es })}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(selectedDate, 'd MMMM yyyy', { locale: es })}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setSelectedDate(d => addDays(d, 1))}
                >
                  <Icon name="chevron_right" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Time selector */}
            <div className="space-y-2">
              <Label>Nueva hora</Label>
              <div className="flex gap-2">
                <Select value={selectedHour} onValueChange={setSelectedHour}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => (
                      <SelectItem key={h} value={h.toString().padStart(2, '0')}>
                        {h.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Min" />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map(m => (
                      <SelectItem key={m} value={m}>
                        :{m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleMove} disabled={isMoving || isCheckingConflicts}>
              {isCheckingConflicts ? (
                <>
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : isMoving ? 'Moviendo...' : 'Mover sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictsDialog
        open={showConflictsDialog}
        onOpenChange={setShowConflictsDialog}
        conflicts={conflicts}
        isRecurring={false}
        totalSessions={1}
        onCancel={() => setShowConflictsDialog(false)}
        onForceCreate={executeMove}
      />
    </>
  );
}

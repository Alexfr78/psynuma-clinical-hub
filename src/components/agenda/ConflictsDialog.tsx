import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Calendar, Clock, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConflictResult } from '@/lib/conflicts';

interface ConflictsDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  conflicts: ConflictResult[];
  isRecurring?: boolean;
  totalSessions?: number;
  onCancel: () => void;
  onCreateNonConflicting?: () => void;
  onForceCreate: () => void;
}

const MAX_DISPLAY_CONFLICTS = 20;

export function ConflictsDialog({
  open,
  onOpenChange,
  conflicts,
  isRecurring = false,
  totalSessions = 1,
  onCancel,
  onCreateNonConflicting,
  onForceCreate,
}: ConflictsDialogProps) {
  const conflictCount = conflicts.length;
  const nonConflictingCount = totalSessions - conflictCount;
  const hasMoreConflicts = conflictCount > MAX_DISPLAY_CONFLICTS;
  const displayedConflicts = conflicts.slice(0, MAX_DISPLAY_CONFLICTS);

  const handleCancel = () => {
    onCancel();
    onOpenChange?.(false);
  };

  const handleCreateNonConflicting = () => {
    onCreateNonConflicting?.();
    onOpenChange?.(false);
  };

  const handleForceCreate = () => {
    onForceCreate();
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange ?? (() => {})}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Conflictos detectados
          </DialogTitle>
          <DialogDescription>
            {isRecurring ? (
              <>
                {conflictCount} de {totalSessions} citas se solapan con citas existentes del profesional.
              </>
            ) : (
              'Esta cita se solapa con otra cita existente del profesional.'
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-4">
            {displayedConflicts.map((conflict, index) => (
              <div
                key={conflict.tempId || index}
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
              >
                <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
                  <Calendar className="h-4 w-4" />
                  {format(conflict.start, "EEEE d 'de' MMMM", { locale: es })}
                  <span className="flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3" />
                    {format(conflict.start, 'HH:mm')} - {format(conflict.end, 'HH:mm')}
                  </span>
                </div>
                <div className="mt-2 space-y-1 pl-6 text-sm text-muted-foreground">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Conflictos con:
                  </p>
                  {conflict.conflicts.map((c, i) => (
                    <div
                      key={c.id || i}
                      className="flex items-center gap-2 text-foreground"
                    >
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {c.start.slice(0, 5)} - {c.end.slice(0, 5)}
                        {c.patientName && `: ${c.patientName}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {hasMoreConflicts && (
              <p className="text-center text-sm text-muted-foreground">
                +{conflictCount - MAX_DISPLAY_CONFLICTS} conflictos más...
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto">
            Cancelar
          </Button>
          
          {isRecurring && nonConflictingCount > 0 && (
            <Button
              variant="secondary"
              onClick={handleCreateNonConflicting}
              className="w-full sm:w-auto"
            >
              Crear solo {nonConflictingCount} sin conflicto
            </Button>
          )}
          
          <Button
            variant="destructive"
            onClick={handleForceCreate}
            className="w-full sm:w-auto"
          >
            {isRecurring ? 'Crear todas igualmente' : 'Crear igualmente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

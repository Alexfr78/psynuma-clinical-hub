import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Pencil, Trash2, Building2, User, Ban } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCenter } from '@/hooks/useCenter';
import { useScheduleExceptions, useDeleteScheduleException } from '@/hooks/useScheduleExceptions';
import { useProfessionals } from '@/hooks/usePatients';
import { getReasonLabel, ScheduleException } from '@/lib/schedule-exceptions';
import { CreateScheduleExceptionDialog } from './CreateScheduleExceptionDialog';

const REASON_COLORS: Record<string, string> = {
  holiday: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  vacation: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  sick_leave: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  training: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  closure: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  other: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

export function ScheduleExceptionsSection() {
  const { center } = useCenter();
  const { data: exceptions, isLoading } = useScheduleExceptions(center?.id);
  const { data: professionals } = useProfessionals();
  const deleteException = useDeleteScheduleException();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editException, setEditException] = useState<ScheduleException | null>(null);

  const getProfessionalName = (id: string | null) => {
    if (!id) return null;
    const p = professionals?.find((pr) => pr.id === id);
    return p ? `${p.first_name} ${p.last_name}` : 'Profesional';
  };

  const handleEdit = (exc: ScheduleException) => {
    setEditException(exc);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditException(null);
    setDialogOpen(true);
  };

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (start === end) return format(s, "d 'de' MMMM yyyy", { locale: es });
    return `${format(s, "d MMM", { locale: es })} — ${format(e, "d MMM yyyy", { locale: es })}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Días no laborables
          </CardTitle>
          <CardDescription>
            Gestiona festivos, vacaciones y cierres del centro o de profesionales específicos
          </CardDescription>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Añadir bloqueo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Cargando...</p>
        ) : !exceptions?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Ban className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay bloqueos configurados</p>
            <p className="text-xs mt-1">Añade festivos, vacaciones u otros cierres</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exceptions.map((exc) => (
              <div key={exc.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={REASON_COLORS[exc.reason_type] || ''}>
                      {getReasonLabel(exc.reason_type, exc.reason_label)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {exc.scope === 'center' ? (
                        <><Building2 className="h-3 w-3 mr-1" />Centro</>
                      ) : (
                        <><User className="h-3 w-3 mr-1" />{getProfessionalName(exc.professional_id)}</>
                      )}
                    </Badge>
                    {!exc.affects_booking && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Solo informativo</Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1">{formatDateRange(exc.start_date, exc.end_date)}</p>
                  {!exc.all_day && exc.start_time && exc.end_time && (
                    <p className="text-xs text-muted-foreground">{exc.start_time.slice(0, 5)} — {exc.end_time.slice(0, 5)}</p>
                  )}
                  {exc.notes && <p className="text-xs text-muted-foreground mt-1">{exc.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(exc)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteException.mutate(exc.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateScheduleExceptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editException={editException}
      />
    </Card>
  );
}

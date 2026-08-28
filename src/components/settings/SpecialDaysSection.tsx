import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarClock, CalendarX, CalendarPlus } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCenter } from '@/hooks/useCenter';
import {
  useSpecialDays,
  useDeleteSpecialDay,
} from '@/hooks/useSpecialDays';
import { useProfessionals } from '@/hooks/usePatients';
import {
  SPECIAL_DAY_TYPE_LABELS,
  type SpecialDay,
  type SpecialDayType,
} from '@/lib/special-days';
import { CreateSpecialDayDialog } from './CreateSpecialDayDialog';
import { Icon } from '@/components/ui/icon';

const TYPE_COLORS: Record<SpecialDayType, string> = {
  closed: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  custom: 'bg-primary/10 text-primary',
  extended:
    'bg-[hsl(142,70%,40%)]/10 text-[hsl(142,60%,30%)] dark:text-[hsl(142,60%,65%)]',
};

const TYPE_ICONS: Record<SpecialDayType, React.ComponentType<{ className?: string }>> = {
  closed: CalendarX,
  custom: CalendarClock,
  extended: CalendarPlus,
};

export function SpecialDaysSection() {
  const { center } = useCenter();
  const { data: specialDays, isLoading } = useSpecialDays(center?.id);
  const { data: professionals } = useProfessionals();
  const deleteSpecialDay = useDeleteSpecialDay();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSpecialDay, setEditSpecialDay] = useState<SpecialDay | null>(null);

  const getProfessionalName = (id: string | null) => {
    if (!id) return 'Profesional';
    const p = professionals?.find((pr) => pr.id === id);
    return p ? `${p.first_name} ${p.last_name}` : 'Profesional';
  };

  const handleEdit = (sd: SpecialDay) => {
    setEditSpecialDay(sd);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditSpecialDay(null);
    setDialogOpen(true);
  };

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (start === end) return format(s, "d 'de' MMMM yyyy", { locale: es });
    return `${format(s, 'd MMM', { locale: es })} — ${format(e, "d MMM yyyy", { locale: es })}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon name="date_range" className="h-5 w-5" />
              Días especiales
            </CardTitle>
            <CardDescription>
              Sobrescribe el horario semanal en fechas concretas: cierres, horarios personalizados o tramos adicionales
            </CardDescription>
          </div>
          <Button onClick={handleCreate} size="sm" variant="outline" className="shrink-0">
            <Icon name="add" className="h-4 w-4 mr-1" /> Nuevo día especial
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Cargando...</p>
        ) : !specialDays?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Icon name="date_range" className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay días especiales configurados</p>
            <p className="text-xs mt-1">
              Usa el botón «Nuevo día especial» para crear excepciones al horario semanal
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {specialDays.map((sd) => {
              const TypeIcon = TYPE_ICONS[sd.type];
              const slots = sd.special_day_slots || [];
              return (
                <div
                  key={sd.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={TYPE_COLORS[sd.type]}>
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {SPECIAL_DAY_TYPE_LABELS[sd.type]}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {sd.scope === 'center' ? (
                          <>
                            <Icon name="apartment" className="h-3 w-3 mr-1" />
                            Centro
                          </>
                        ) : (
                          <>
                            <Icon name="person" className="h-3 w-3 mr-1" />
                            {getProfessionalName(sd.professional_id)}
                          </>
                        )}
                      </Badge>
                      {!sd.affects_public_booking && (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          Solo agenda interna
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm mt-1">
                      {formatDateRange(sd.start_date, sd.end_date)}
                    </p>

                    {sd.label && (
                      <p className="text-sm font-medium mt-0.5">{sd.label}</p>
                    )}

                    {sd.type !== 'closed' && slots.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                        <Icon name="schedule" className="h-3 w-3" />
                        <span>
                          {slots
                            .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
                            .join(' · ')}
                        </span>
                      </div>
                    )}

                    {sd.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{sd.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(sd)}
                    >
                      <Icon name="edit" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteSpecialDay.mutate(sd.id)}
                    >
                      <Icon name="delete" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CreateSpecialDayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editSpecialDay={editSpecialDay}
      />
    </Card>
  );
}

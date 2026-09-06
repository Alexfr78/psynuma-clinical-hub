import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';
import { PlaudRecordingCard } from '@/components/plaud/PlaudRecordingCard';
import { usePlaudRecordings, usePlaudReviewStats } from '@/hooks/usePlaudRecordings';

/**
 * Bandeja de revisión de grabaciones Plaud.
 *
 * Se coloca como página propia (no dentro de Sesiones ni de Configuración) porque es un
 * control de seguridad de datos, no una preferencia de configuración ni un listado de
 * sesiones más: el trabajo aquí es decidir, caso por caso, si el sistema puede confiar en
 * su propia sugerencia de a qué paciente pertenece cada grabación. Mezclarla con otra
 * pantalla le restaría la atención dedicada que pide el encargo.
 */
export default function PlaudReview() {
  const [tab, setTab] = useState<'needs_review' | 'resolved'>('needs_review');

  const needsReview = usePlaudRecordings('needs_review');
  const resolved = usePlaudRecordings('resolved', { enabled: tab === 'resolved' });
  const stats = usePlaudReviewStats(needsReview.data);

  const activeQuery = tab === 'needs_review' ? needsReview : resolved;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Icon name="graphic_eq" className="h-6 w-6" />
          Grabaciones Plaud
        </h1>
        <p className="text-muted-foreground">
          Revisa las grabaciones que el sistema no ha podido emparejar con confianza antes de
          que pasen a la ficha de un paciente.
        </p>
      </div>

      {stats.total > 0 && (stats.multiSession > 0 || stats.overlap > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pendientes de revisión</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className={stats.multiSession > 0 ? 'border-destructive/40' : undefined}>
            <CardHeader className="pb-2">
              <CardDescription>Con sospecha de varias sesiones</CardDescription>
              <CardTitle className="text-2xl text-destructive">{stats.multiSession}</CardTitle>
            </CardHeader>
          </Card>
          <Card className={stats.overlap > 0 ? 'border-destructive/40' : undefined}>
            <CardHeader className="pb-2">
              <CardDescription>Con solapamiento</CardDescription>
              <CardTitle className="text-2xl text-destructive">{stats.overlap}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'needs_review' | 'resolved')}>
        <TabsList>
          <TabsTrigger value="needs_review" className="gap-2">
            Por revisar
            {needsReview.data && needsReview.data.length > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-1.5 py-0.5">
                {needsReview.data.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved">Resueltas</TabsTrigger>
        </TabsList>

        <TabsContent value="needs_review" className="space-y-4 mt-4">
          <RecordingsList
            isLoading={needsReview.isLoading}
            recordings={needsReview.data}
            emptyIcon="task_alt"
            emptyTitle="No hay nada pendiente de revisión"
            emptyDescription="Todas las grabaciones se han emparejado con confianza o ya han sido resueltas a mano. Cuando llegue una nueva grabación que el sistema no pueda confirmar por sí solo, aparecerá aquí."
            readOnly={false}
          />
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4 mt-4">
          <RecordingsList
            isLoading={activeQuery.isLoading}
            recordings={resolved.data}
            emptyIcon="history"
            emptyTitle="Todavía no hay grabaciones resueltas"
            emptyDescription="Cuando se confirme, elija otra sesión o se descarte una grabación, quedará aquí como historial."
            readOnly
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecordingsList({
  isLoading,
  recordings,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  readOnly,
}: {
  isLoading: boolean;
  recordings: ReturnType<typeof usePlaudRecordings>['data'];
  emptyIcon: string;
  emptyTitle: string;
  emptyDescription: string;
  readOnly: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!recordings || recordings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Icon name={emptyIcon} className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium">{emptyTitle}</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-1">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {recordings.map((recording) => (
        <PlaudRecordingCard key={recording.id} recording={recording} readOnly={readOnly} />
      ))}
    </div>
  );
}

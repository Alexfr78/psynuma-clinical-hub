import { ListPagination } from '@/components/ListPagination';
import { usePagination } from '@/hooks/usePagination';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssessmentActions, useAssessmentsPage, useAssessmentCounts, Assessment } from '@/hooks/useAssessments';
import { AssessmentCard } from '@/components/assessments/AssessmentCard';
import { CreateAssessmentDialog } from '@/components/assessments/CreateAssessmentDialog';
import { AssessmentDetailDialog } from '@/components/assessments/AssessmentDetailDialog';
import { SendAssessmentDialog } from '@/components/assessments/SendAssessmentDialog';
import { Icon } from '@/components/ui/icon';
import { Link } from 'react-router-dom';

export default function Assessments() {
  const { revokeAssessment, deleteAssessment } = useAssessmentActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewAssessment, setViewAssessment] = useState<Assessment | null>(null);
  const [sendAssessment, setSendAssessment] = useState<Assessment | null>(null);

  const [tab, setTab] = useState('pending');
  const pagination = usePagination('assessments', [tab]);
  const { data, isLoading, isFetching } = useAssessmentsPage({ tab }, pagination);
  const { data: counts = { pending: 0, completed: 0, other: 0 } } = useAssessmentCounts();
  const pending = tab === 'pending' ? data?.rows ?? [] : [];
  const completed = tab === 'completed' ? data?.rows ?? [] : [];
  const other = tab === 'other' ? data?.rows ?? [] : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Icon name="assignment_turned_in" className="h-5 w-5 sm:h-6 sm:w-6" />
            Evaluaciones
          </h1>
          <p className="text-muted-foreground text-sm">Gestiona las evaluaciones de tus pacientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="sm:size-default" asChild>
            <Link to="/configuracion?section=evaluaciones-plantillas">
              <Icon name="description" className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Gestionar plantillas</span>
              <span className="sm:hidden">Plantillas</span>
            </Link>
          </Button>
          <Button size="sm" className="sm:size-default" onClick={() => setCreateOpen(true)}>
            <Icon name="add" className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nueva evaluación</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <TabsList className="w-full sm:w-auto justify-start sm:justify-center overflow-x-auto flex-nowrap gap-1">
            <TabsTrigger value="pending" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Pend. ({counts.pending})</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Compl. ({counts.completed})</TabsTrigger>
            <TabsTrigger value="other" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Otras ({counts.other})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending" className="mt-6">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="assignment_turned_in" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay evaluaciones pendientes</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pending.map(a => (
                <AssessmentCard
                  key={a.id}
                  assessment={a}
                  onView={setViewAssessment}
                  onSend={setSendAssessment}
                  onRevoke={(a) => revokeAssessment.mutate(a.id)}
                  onDelete={(a) => deleteAssessment.mutate(a.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {completed.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="assignment_turned_in" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay evaluaciones completadas</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {completed.map(a => (
                <AssessmentCard
                  key={a.id}
                  assessment={a}
                  onView={setViewAssessment}
                  onSend={setSendAssessment}
                  onRevoke={(a) => revokeAssessment.mutate(a.id)}
                  onDelete={(a) => deleteAssessment.mutate(a.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="other" className="mt-6">
          {other.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="assignment_turned_in" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay evaluaciones caducadas o revocadas</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {other.map(a => (
                <AssessmentCard
                  key={a.id}
                  assessment={a}
                  onView={setViewAssessment}
                  onSend={setSendAssessment}
                  onRevoke={(a) => revokeAssessment.mutate(a.id)}
                  onDelete={(a) => deleteAssessment.mutate(a.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <ListPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          total={data?.total ?? 0}
          isFetching={isFetching}
          itemLabel={['evaluación', 'evaluaciones']}
        />
      </Tabs>

      <CreateAssessmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssessmentDetailDialog assessment={viewAssessment} onClose={() => setViewAssessment(null)} />
      <SendAssessmentDialog assessment={sendAssessment} onClose={() => setSendAssessment(null)} />
    </div>
  );
}

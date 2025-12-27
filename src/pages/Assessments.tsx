import { useState } from 'react';
import { ClipboardCheck, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssessments, Assessment } from '@/hooks/useAssessments';
import { AssessmentCard } from '@/components/assessments/AssessmentCard';
import { CreateAssessmentDialog } from '@/components/assessments/CreateAssessmentDialog';
import { AssessmentDetailDialog } from '@/components/assessments/AssessmentDetailDialog';
import { SendAssessmentDialog } from '@/components/assessments/SendAssessmentDialog';

export default function Assessments() {
  const { assessments, isLoading, revokeAssessment, deleteAssessment } = useAssessments();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewAssessment, setViewAssessment] = useState<Assessment | null>(null);
  const [sendAssessment, setSendAssessment] = useState<Assessment | null>(null);

  const now = new Date();
  const pending = assessments.filter(a => a.status === 'pending' && new Date(a.expires_at) > now);
  const completed = assessments.filter(a => a.status === 'completed');
  const other = assessments.filter(a => 
    a.status === 'revoked' || 
    a.status === 'expired' || 
    (a.status === 'pending' && new Date(a.expires_at) <= now)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Evaluaciones
          </h1>
          <p className="text-muted-foreground">Gestiona las evaluaciones de tus pacientes</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva evaluación
        </Button>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pendientes ({pending.length})</TabsTrigger>
          <TabsTrigger value="completed">Completadas ({completed.length})</TabsTrigger>
          <TabsTrigger value="other">Otras ({other.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
      </Tabs>

      <CreateAssessmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AssessmentDetailDialog assessment={viewAssessment} onClose={() => setViewAssessment(null)} />
      <SendAssessmentDialog assessment={sendAssessment} onClose={() => setSendAssessment(null)} />
    </div>
  );
}

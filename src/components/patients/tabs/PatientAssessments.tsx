import { useState } from 'react';
import { ClipboardCheck, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssessments, Assessment } from '@/hooks/useAssessments';
import { AssessmentCard } from '@/components/assessments/AssessmentCard';
import { CreateAssessmentDialog } from '@/components/assessments/CreateAssessmentDialog';
import { AssessmentDetailDialog } from '@/components/assessments/AssessmentDetailDialog';
import { SendAssessmentDialog } from '@/components/assessments/SendAssessmentDialog';

interface PatientAssessmentsProps {
  patientId: string;
}

export function PatientAssessments({ patientId }: PatientAssessmentsProps) {
  const { assessments, isLoading, revokeAssessment, deleteAssessment } = useAssessments(patientId);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewAssessment, setViewAssessment] = useState<Assessment | null>(null);
  const [sendAssessment, setSendAssessment] = useState<Assessment | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Evaluaciones</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva
        </Button>
      </div>

      {assessments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No hay evaluaciones</p>
          <Button variant="link" onClick={() => setCreateOpen(true)}>
            Crear evaluación
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {assessments.map(a => (
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

      <CreateAssessmentDialog open={createOpen} onOpenChange={setCreateOpen} preselectedPatientId={patientId} />
      <AssessmentDetailDialog assessment={viewAssessment} onClose={() => setViewAssessment(null)} />
      <SendAssessmentDialog assessment={sendAssessment} onClose={() => setSendAssessment(null)} />
    </div>
  );
}

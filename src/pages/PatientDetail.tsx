import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePatient } from '@/hooks/usePatients';
import { PatientDetailTabs } from '@/components/patients/PatientDetailTabs';

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: patient, isLoading, error } = usePatient(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Paciente no encontrado</h2>
        <p className="mt-2 text-muted-foreground">
          No se pudo cargar la información del paciente.
        </p>
        <Button className="mt-4" onClick={() => navigate('/pacientes')}>
          Volver a pacientes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/pacientes')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a pacientes
      </Button>

      {/* Patient Detail Tabs */}
      <PatientDetailTabs patient={patient} />
    </div>
  );
}

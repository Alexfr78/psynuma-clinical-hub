import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePatient } from '@/hooks/usePatients';
import { PatientDetailTabs } from '@/components/patients/PatientDetailTabs';
import { useAuditLog } from '@/hooks/useAuditLog';

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
        <h2 className="mt-4 font-display text-xl font-semibold">Contacto no encontrado</h2>
        <p className="mt-2 text-muted-foreground">
          No se pudo cargar la información del contacto.
        </p>
        <Button className="mt-4" onClick={() => navigate('/pacientes')}>
          Volver a contactos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/pacientes')} className="text-xs sm:text-sm">
        <ArrowLeft className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Volver a contactos</span>
        <span className="sm:hidden">Volver</span>
      </Button>

      {/* Patient Detail Tabs */}
      <PatientDetailTabs patient={patient} />
    </div>
  );
}

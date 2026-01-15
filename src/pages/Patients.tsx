import { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { usePatients, PatientFilters as Filters } from '@/hooks/usePatients';
import { PatientFilters } from '@/components/patients/PatientFilters';
import { PatientCard } from '@/components/patients/PatientCard';
import { CreatePatientDialog } from '@/components/patients/CreatePatientDialog';

export default function Patients() {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    professionalId: 'all',
  });

  const { data: patients, isLoading, error } = usePatients(filters);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <Users className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">Error al cargar pacientes</h2>
        <p className="mt-2 text-muted-foreground">
          No se pudieron cargar los pacientes. Por favor, inténtalo de nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Pacientes</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona la información de tus pacientes
          </p>
        </div>
        <CreatePatientDialog />
      </div>

      {/* Filters */}
      <PatientFilters filters={filters} onFiltersChange={setFilters} />

      {/* Patient List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : patients && patients.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold">No hay pacientes</h2>
          <p className="mt-2 max-w-sm text-muted-foreground">
            {filters.search || filters.status !== 'all' || filters.professionalId !== 'all'
              ? 'No se encontraron pacientes con los filtros seleccionados.'
              : 'Comienza añadiendo tu primer paciente para gestionar sus sesiones y datos clínicos.'}
          </p>
        </div>
      )}

      {/* Patient Count */}
      {patients && patients.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Mostrando {patients.length} paciente{patients.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

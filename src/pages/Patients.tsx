import { useState } from 'react';

import { usePatients, PatientFilters as Filters } from '@/hooks/usePatients';
import { usePatientSessionSummaries } from '@/hooks/usePatientSessionSummaries';
import { PatientFilters } from '@/components/patients/PatientFilters';
import { PatientCard } from '@/components/patients/PatientCard';
import { PatientTable } from '@/components/patients/PatientTable';
import { CreatePatientDialog } from '@/components/patients/CreatePatientDialog';
import { Icon } from '@/components/ui/icon';

export default function Patients() {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    professionalId: 'all',
  });

  const { data: patients, isLoading, error } = usePatients(filters);
  const { data: sessionSummaries } = usePatientSessionSummaries();

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <Icon name="group" className="h-8 w-8 text-destructive" />
        </div>
         <h2 className="mt-4 font-display text-xl font-semibold">Error al cargar contactos</h2>
        <p className="mt-2 text-muted-foreground">
          No se pudieron cargar los contactos. Por favor, inténtalo de nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Contactos</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona la información de tus contactos
          </p>
        </div>
        <CreatePatientDialog />
      </div>

      {/* Data Card */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="border-b bg-muted/30 p-4 sm:p-6">
          <PatientFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : patients && patients.length > 0 ? (
          <>
            <PatientTable patients={patients} sessionSummaries={sessionSummaries} />
            <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
              {patients.map((patient) => (
                <PatientCard key={patient.id} patient={patient} />
              ))}
            </div>
            <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground sm:px-6">
              Mostrando {patients.length} contacto{patients.length !== 1 ? 's' : ''}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4">
              <Icon name="group" className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">No hay contactos</h2>
            <p className="mt-2 max-w-sm text-muted-foreground">
              {filters.search || filters.status !== 'all' || filters.professionalId !== 'all'
                ? 'No se encontraron contactos con los filtros seleccionados.'
                : 'Comienza añadiendo tu primer contacto para gestionar sus sesiones y datos clínicos.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

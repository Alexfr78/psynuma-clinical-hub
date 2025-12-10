import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientSummary } from './tabs/PatientSummary';
import { PatientData } from './tabs/PatientData';
import { PatientSessions } from './tabs/PatientSessions';
import { PatientInvoices } from './tabs/PatientInvoices';
import { PatientBonos } from './tabs/PatientBonos';
import { Patient } from '@/hooks/usePatients';

interface PatientDetailTabsProps {
  patient: Patient & {
    assigned_professional?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      specialty: string | null;
    } | null;
  };
}

export function PatientDetailTabs({ patient }: PatientDetailTabsProps) {
  return (
    <Tabs defaultValue="summary" className="w-full">
      <TabsList className="mb-6 w-full justify-start overflow-x-auto">
        <TabsTrigger value="summary">Resumen</TabsTrigger>
        <TabsTrigger value="data">Datos</TabsTrigger>
        <TabsTrigger value="sessions">Sesiones</TabsTrigger>
        <TabsTrigger value="invoices">Facturas</TabsTrigger>
        <TabsTrigger value="bonos">Bonos</TabsTrigger>
      </TabsList>

      <TabsContent value="summary">
        <PatientSummary patient={patient} />
      </TabsContent>

      <TabsContent value="data">
        <PatientData patient={patient} />
      </TabsContent>

      <TabsContent value="sessions">
        <PatientSessions patientId={patient.id} />
      </TabsContent>

      <TabsContent value="invoices">
        <PatientInvoices patientId={patient.id} />
      </TabsContent>

      <TabsContent value="bonos">
        <PatientBonos patientId={patient.id} />
      </TabsContent>
    </Tabs>
  );
}

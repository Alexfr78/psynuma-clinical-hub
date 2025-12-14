import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientSummary } from './tabs/PatientSummary';
import { PatientData } from './tabs/PatientData';
import { PatientSessions } from './tabs/PatientSessions';
import { PatientInvoices } from './tabs/PatientInvoices';
import { PatientBonos } from './tabs/PatientBonos';
import { PatientConsents } from './tabs/PatientConsents';
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
      <TabsList className="mb-4 sm:mb-6 w-full justify-start overflow-x-auto flex-nowrap scrollbar-hide">
        <TabsTrigger value="summary" className="text-xs sm:text-sm px-2 sm:px-3">Resumen</TabsTrigger>
        <TabsTrigger value="data" className="text-xs sm:text-sm px-2 sm:px-3">Datos</TabsTrigger>
        <TabsTrigger value="sessions" className="text-xs sm:text-sm px-2 sm:px-3">Sesiones</TabsTrigger>
        <TabsTrigger value="invoices" className="text-xs sm:text-sm px-2 sm:px-3">Facturas</TabsTrigger>
        <TabsTrigger value="bonos" className="text-xs sm:text-sm px-2 sm:px-3">Bonos</TabsTrigger>
        <TabsTrigger value="consents" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">Consentimientos</TabsTrigger>
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

      <TabsContent value="consents">
        <PatientConsents patientId={patient.id} patient={patient} />
      </TabsContent>
    </Tabs>
  );
}

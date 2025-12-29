import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientSummary } from './tabs/PatientSummary';
import { PatientData } from './tabs/PatientData';
import { PatientSessions } from './tabs/PatientSessions';
import { PatientInvoices } from './tabs/PatientInvoices';
import { PatientBonos } from './tabs/PatientBonos';
import { PatientConsents } from './tabs/PatientConsents';
import { PatientAssessments } from './tabs/PatientAssessments';
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
      <div className="relative mb-4 sm:mb-6">
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap scrollbar-hide gap-1">
          <TabsTrigger value="summary" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Resumen</TabsTrigger>
          <TabsTrigger value="data" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Datos</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Sesiones</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Facturas</TabsTrigger>
          <TabsTrigger value="bonos" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Bonos</TabsTrigger>
          <TabsTrigger value="consents" className="text-xs sm:text-sm px-3 py-2 min-h-[40px] whitespace-nowrap">Consent.</TabsTrigger>
          <TabsTrigger value="assessments" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Evalua.</TabsTrigger>
        </TabsList>
      </div>

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

      <TabsContent value="assessments">
        <PatientAssessments patientId={patient.id} />
      </TabsContent>
    </Tabs>
  );
}

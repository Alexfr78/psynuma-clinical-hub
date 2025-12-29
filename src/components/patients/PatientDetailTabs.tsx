import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const tabOptions = [
  { value: 'summary', label: 'Resumen' },
  { value: 'data', label: 'Datos' },
  { value: 'sessions', label: 'Sesiones' },
  { value: 'invoices', label: 'Facturas' },
  { value: 'bonos', label: 'Bonos' },
  { value: 'consents', label: 'Consentimientos' },
  { value: 'assessments', label: 'Evaluaciones' },
];

export function PatientDetailTabs({ patient }: PatientDetailTabsProps) {
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {/* Mobile: Select dropdown */}
      <div className="mb-4 sm:hidden">
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabOptions.map((tab) => (
              <SelectItem key={tab.value} value={tab.value}>
                {tab.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Horizontal tabs */}
      <TabsList className="hidden sm:flex mb-4 sm:mb-6 w-full justify-start flex-wrap h-auto gap-1">
        {tabOptions.map((tab) => (
          <TabsTrigger 
            key={tab.value} 
            value={tab.value} 
            className="text-xs sm:text-sm px-3 py-2"
          >
            {tab.label}
          </TabsTrigger>
        ))}
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

      <TabsContent value="assessments">
        <PatientAssessments patientId={patient.id} />
      </TabsContent>
    </Tabs>
  );
}

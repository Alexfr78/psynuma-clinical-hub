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
import { PatientAutoregistros } from './tabs/PatientAutoregistros';
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
  { value: 'autoregistros', label: 'Autorregistros' },
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

      {/* Desktop: Horizontal tabs with scroll indicator */}
      <div className="hidden sm:block relative mb-4 sm:mb-6">
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 md:hidden" />
        <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 md:hidden" />
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto gap-1 p-1">
          {tabOptions.map((tab) => (
            <TabsTrigger 
              key={tab.value} 
              value={tab.value} 
              className="flex-shrink-0 text-xs sm:text-sm px-3 py-2 min-h-[40px]"
            >
              {tab.label}
            </TabsTrigger>
          ))}
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

      <TabsContent value="autoregistros">
        <PatientAutoregistros patientId={patient.id} />
      </TabsContent>
    </Tabs>
  );
}

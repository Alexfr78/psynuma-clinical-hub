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
import { PatientAIReports } from './tabs/PatientAIReports';
import { PatientCustomPrices } from './tabs/PatientCustomPrices';
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

// Tabs de primer nivel visibles en el detalle de contacto. Sesiones, Finanzas y
// Documentos clínicos agrupan internamente varias sub-secciones (ver más abajo)
// para reducir la navegación de 10 a 5 pestañas.
const tabOptions = [
  { value: 'summary', label: 'Resumen' },
  { value: 'data', label: 'Datos' },
  { value: 'sessions', label: 'Sesiones' },
  { value: 'finance', label: 'Finanzas' },
  { value: 'documents', label: 'Documentos clínicos' },
];

const sessionsSubTabs = [
  { value: 'all', label: 'Todas' },
  { value: 'ai-reports', label: 'Resúmenes IA' },
];

const financeSubTabs = [
  { value: 'invoices', label: 'Facturas' },
  { value: 'bonos', label: 'Bonos' },
  { value: 'pricing', label: 'Tarifas' },
];

const documentsSubTabs = [
  { value: 'consents', label: 'Consentimientos' },
  { value: 'assessments', label: 'Evaluaciones' },
  { value: 'autoregistros', label: 'Autorregistros' },
];

interface PatientDetailTabsControlledProps extends PatientDetailTabsProps {
  activeTab?: string;
  onActiveTabChange?: (tab: string) => void;
}

function SubTabsList({ options }: { options: { value: string; label: string }[] }) {
  return (
    <TabsList className="mb-4 h-auto flex-nowrap justify-start gap-1 overflow-x-auto p-1">
      {options.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          className="flex-shrink-0 min-h-[36px] px-3 py-1.5 text-xs sm:text-sm"
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export function PatientDetailTabs({ patient, activeTab: controlledTab, onActiveTabChange }: PatientDetailTabsControlledProps) {
  const [internalTab, setInternalTab] = useState('summary');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onActiveTabChange ?? setInternalTab;

  const [sessionsSubTab, setSessionsSubTab] = useState('all');
  const [financeSubTab, setFinanceSubTab] = useState('invoices');
  const [documentsSubTab, setDocumentsSubTab] = useState('consents');

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
        <PatientSummary
          patient={patient}
          onNavigateToConsents={() => {
            setActiveTab('documents');
            setDocumentsSubTab('consents');
          }}
        />
      </TabsContent>

      <TabsContent value="data">
        <PatientData patient={patient} />
      </TabsContent>

      <TabsContent value="sessions">
        <Tabs value={sessionsSubTab} onValueChange={setSessionsSubTab}>
          <SubTabsList options={sessionsSubTabs} />
          <TabsContent value="all">
            <PatientSessions patientId={patient.id} />
          </TabsContent>
          <TabsContent value="ai-reports">
            <PatientAIReports patientId={patient.id} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="finance">
        <Tabs value={financeSubTab} onValueChange={setFinanceSubTab}>
          <SubTabsList options={financeSubTabs} />
          <TabsContent value="invoices">
            <PatientInvoices patientId={patient.id} />
          </TabsContent>
          <TabsContent value="bonos">
            <PatientBonos patientId={patient.id} />
          </TabsContent>
          <TabsContent value="pricing">
            <PatientCustomPrices patientId={patient.id} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="documents">
        <Tabs value={documentsSubTab} onValueChange={setDocumentsSubTab}>
          <SubTabsList options={documentsSubTabs} />
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
      </TabsContent>
    </Tabs>
  );
}

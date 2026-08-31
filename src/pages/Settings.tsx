import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { InvoicingInfoSection } from '@/components/settings/InvoicingInfoSection';
import { InvoiceEditSection } from '@/components/settings/InvoiceEditSection';
import { InvoiceSeriesSection } from '@/components/settings/InvoiceSeriesSection';
import { InvoiceAutomationSection } from '@/components/settings/InvoiceAutomationSection';
import { LocationsSection } from '@/components/settings/LocationsSection';
import { SessionTypesSection } from '@/components/settings/SessionTypesSection';
import { PaymentSettingsSection } from '@/components/settings/PaymentSettingsSection';
import { CancellationPolicySettingsSection } from '@/components/settings/CancellationPolicySettingsSection';
import { EmailTemplateEditor } from '@/components/settings/communications/EmailTemplateEditor';
import { WhatsAppTemplateEditor } from '@/components/settings/communications/WhatsAppTemplateEditor';
import { SmsTemplateEditor } from '@/components/settings/communications/SmsTemplateEditor';
import { BookingTemplatesEditor } from '@/components/settings/communications/BookingTemplatesEditor';
import { PaymentReminderTemplateEditor } from '@/components/settings/communications/PaymentReminderTemplateEditor';
import { SessionReminderSettingsSection } from '@/components/settings/SessionReminderSettingsSection';
import { VerifactuConfigSection } from '@/components/settings/VerifactuConfigSection';
import { ResponsibleDeclarationSection } from '@/components/settings/ResponsibleDeclarationSection';
import { VerifactuExportSection } from '@/components/settings/VerifactuExportSection';
import { PortalSettingsSection } from '@/components/settings/PortalSettingsSection';
import { ConsentSettingsSection } from '@/components/settings/ConsentSettingsSection';
import { ConsentTemplatesSection } from '@/components/settings/ConsentTemplatesSection';
import { AssessmentTemplatesSection } from '@/components/settings/AssessmentTemplatesSection';
import { AutoregistroTemplatesSection } from '@/components/settings/AutoregistroTemplatesSection';
import { IntegrationsOverview } from '@/components/settings/integrations/IntegrationsOverview';
import { WhatsAppIntegrationSection } from '@/components/settings/integrations/WhatsAppIntegrationSection';
// WasenderIntegrationSection is now integrated into WhatsAppIntegrationSection
import { ZoomIntegrationSection } from '@/components/settings/integrations/ZoomIntegrationSection';
import { GoogleIntegrationSection } from '@/components/settings/integrations/GoogleIntegrationSection';
import { GoogleDriveIntegrationSection } from '@/components/settings/integrations/GoogleDriveIntegrationSection';
import { StripeIntegrationSection } from '@/components/settings/integrations/StripeIntegrationSection';
import { EmailIntegrationSection } from '@/components/settings/integrations/EmailIntegrationSection';
import { OAuthCredentialsSection } from '@/components/settings/integrations/OAuthCredentialsSection';
import { AgendaSettingsSection } from '@/components/settings/AgendaSettingsSection';
import { AdminAlertsSettingsSection } from '@/components/settings/AdminAlertsSettingsSection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { ScheduleExceptionsSection } from '@/components/settings/ScheduleExceptionsSection';
import { SpecialDaysSection } from '@/components/settings/SpecialDaysSection';
import { AISettingsSection } from '@/components/settings/integrations/AISettingsSection';
import { VersionManagementSection } from '@/components/settings/VersionManagementSection';
import { TariffPlansSection } from '@/components/settings/TariffPlansSection';
import { ExpenseCategoriesSection } from '@/components/settings/ExpenseCategoriesSection';
import { RecurringExpensesSection } from '@/components/settings/RecurringExpensesSection';
import { ProfessionalCompensationSection } from '@/components/settings/ProfessionalCompensationSection';
import { Icon } from '@/components/ui/icon';

const centerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
});

type CenterFormValues = z.infer<typeof centerSchema>;

type SettingsSection =
  | 'tarifas'
  | 'centro-info'
  | 'centro-ubicaciones'
  | 'centro-agenda'
  | 'centro-excepciones'
  | 'centro-dias-especiales'
  | 'centro-portal'
  
  | 'sesiones-tipos'
  | 'pagos-config'
  | 'pagos-politica-cancelacion'
  | 'consentimientos-config'
  | 'consentimientos-plantillas'
  | 'evaluaciones-plantillas'
  | 'autorregistros-plantillas'
  | 'facturacion-info'
  | 'facturacion-editar' 
  | 'facturacion-series' 
  | 'facturacion-automatizar'
  | 'facturacion-verifactu'
  | 'facturacion-verifactu-declaracion'
  | 'facturacion-verifactu-exportar'
  | 'gastos-categorias'
  | 'gastos-recurrentes'
  | 'gastos-compensacion-profesionales'
  | 'comunicaciones-email'
  | 'comunicaciones-whatsapp'
  | 'comunicaciones-sms'
  | 'comunicaciones-recordatorios'
  | 'comunicaciones-recordatorios-pago'
  | 'comunicaciones-alertas-admin'
  | 'comunicaciones-confirmaciones-cita'
  | 'integraciones-resumen'
  | 'integraciones-credenciales'
  | 'integraciones-email'
  | 'integraciones-whatsapp'
  
  | 'integraciones-zoom'
  | 'integraciones-google'
  | 'integraciones-google-drive'
  | 'integraciones-stripe'
  | 'integraciones-ia'
  | 'seguridad'
  | 'versiones';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: string;
  parent: string;
  subgroup?: string;
}

// Category icons for main sections
const categoryIcons: Record<string, string> = {
  'Mi Centro': 'apartment',
  'Portal de Contactos': 'group',
  'Pagos y Facturación': 'account_balance_wallet',
  'Comunicaciones': 'mail',
  'Conexiones Externas': 'power',
  'Seguridad': 'shield',
  'Sistema': 'account_tree',
};

const navItems: NavItem[] = [
  // Mi Centro
  { id: 'centro-info', label: 'Datos del centro', icon: 'apartment', parent: 'Mi Centro' },
  { id: 'centro-ubicaciones', label: 'Ubicaciones', icon: 'location_on', parent: 'Mi Centro' },
  { id: 'centro-agenda', label: 'Configuración de agenda', icon: 'calendar_month', parent: 'Mi Centro', subgroup: 'Agenda' },
  { id: 'centro-excepciones', label: 'Días no laborables', icon: 'block', parent: 'Mi Centro', subgroup: 'Agenda' },
  { id: 'centro-dias-especiales', label: 'Días especiales', icon: 'date_range', parent: 'Mi Centro', subgroup: 'Agenda' },
  { id: 'sesiones-tipos', label: 'Tipos de cita', icon: 'calendar_month', parent: 'Mi Centro', subgroup: 'Agenda' },

  // Portal de Contactos
  { id: 'centro-portal', label: 'Configuración del portal', icon: 'tune', parent: 'Portal de Contactos' },
  { id: 'consentimientos-config', label: 'Consentimientos informados', icon: 'description', parent: 'Portal de Contactos' },

  { id: 'consentimientos-plantillas', label: 'Plantillas de consentimiento', icon: 'edit_document', parent: 'Portal de Contactos', subgroup: 'Plantillas' },
  { id: 'evaluaciones-plantillas', label: 'Plantillas de evaluación', icon: 'assignment_turned_in', parent: 'Portal de Contactos', subgroup: 'Plantillas' },
  { id: 'autorregistros-plantillas', label: 'Plantillas de autorregistro', icon: 'edit_note', parent: 'Portal de Contactos', subgroup: 'Plantillas' },

  // Pagos y Facturación
  { id: 'tarifas', label: 'Planes tarifarios', icon: 'layers', parent: 'Pagos y Facturación' },
  { id: 'pagos-config', label: 'Métodos de cobro', icon: 'account_balance_wallet', parent: 'Pagos y Facturación' },
  { id: 'pagos-politica-cancelacion', label: 'Política de cancelación', icon: 'description', parent: 'Pagos y Facturación' },
  { id: 'facturacion-info', label: 'Datos fiscales', icon: 'receipt_long', parent: 'Pagos y Facturación' },
  { id: 'facturacion-editar', label: 'Personalizar facturas', icon: 'edit', parent: 'Pagos y Facturación' },
  { id: 'facturacion-series', label: 'Series de facturas', icon: 'list', parent: 'Pagos y Facturación' },
  { id: 'facturacion-automatizar', label: 'Facturación automática', icon: 'bolt', parent: 'Pagos y Facturación' },
  // Verifactu subgroup
  { id: 'facturacion-verifactu', label: 'Certificado digital', icon: 'shield', parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  { id: 'facturacion-verifactu-declaracion', label: 'Declaración responsable', icon: 'description', parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  { id: 'facturacion-verifactu-exportar', label: 'Exportar registros', icon: 'file_download', parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  // Gastos subgroup
  { id: 'gastos-categorias', label: 'Categorías de gasto', icon: 'category', parent: 'Pagos y Facturación', subgroup: 'Gastos' },
  { id: 'gastos-recurrentes', label: 'Gastos recurrentes', icon: 'autorenew', parent: 'Pagos y Facturación', subgroup: 'Gastos' },
  { id: 'gastos-compensacion-profesionales', label: 'Compensación de profesionales', icon: 'diversity_3', parent: 'Pagos y Facturación', subgroup: 'Gastos' },

  // Comunicaciones — Eventos de cita (creación/reprogramación/cancelación + recordatorios)
  { id: 'comunicaciones-confirmaciones-cita', label: 'Confirmaciones de cita', icon: 'event_available', parent: 'Comunicaciones', subgroup: 'Eventos de cita' },
  { id: 'comunicaciones-recordatorios', label: 'Recordatorios de cita', icon: 'notifications', parent: 'Comunicaciones', subgroup: 'Eventos de cita' },

  // Comunicaciones — Plantillas generales por canal
  { id: 'comunicaciones-email', label: 'Plantillas de email', icon: 'mail', parent: 'Comunicaciones', subgroup: 'Plantillas por canal' },
  { id: 'comunicaciones-whatsapp', label: 'Plantillas de WhatsApp', icon: 'chat', parent: 'Comunicaciones', subgroup: 'Plantillas por canal' },
  { id: 'comunicaciones-sms', label: 'Plantillas de SMS', icon: 'smartphone', parent: 'Comunicaciones', subgroup: 'Plantillas por canal' },

  // Comunicaciones — Cobros
  { id: 'comunicaciones-recordatorios-pago', label: 'Recordatorios de pago', icon: 'account_balance_wallet', parent: 'Comunicaciones', subgroup: 'Cobros' },

  // Comunicaciones — Alertas internas
  { id: 'comunicaciones-alertas-admin', label: 'Alertas al profesional', icon: 'notifications', parent: 'Comunicaciones', subgroup: 'Alertas internas' },

  // Conexiones Externas
  { id: 'integraciones-resumen', label: 'Estado de conexiones', icon: 'power', parent: 'Conexiones Externas' },

  { id: 'integraciones-email', label: 'Email (Resend)', icon: 'mail', parent: 'Conexiones Externas', subgroup: 'Comunicación' },
  { id: 'integraciones-whatsapp', label: 'WhatsApp', icon: 'chat', parent: 'Conexiones Externas', subgroup: 'Comunicación' },

  { id: 'integraciones-google', label: 'Google Calendar y Meet', icon: 'calendar_month', parent: 'Conexiones Externas', subgroup: 'Calendario, Vídeo y Documentos' },
  { id: 'integraciones-zoom', label: 'Zoom', icon: 'videocam', parent: 'Conexiones Externas', subgroup: 'Calendario, Vídeo y Documentos' },
  { id: 'integraciones-google-drive', label: 'Google Drive (documentos)', icon: 'hard_drive', parent: 'Conexiones Externas', subgroup: 'Calendario, Vídeo y Documentos' },

  { id: 'integraciones-stripe', label: 'Stripe - Cobros online', icon: 'credit_card', parent: 'Conexiones Externas', subgroup: 'Pagos' },

  { id: 'integraciones-credenciales', label: 'Configuración avanzada', icon: 'tune', parent: 'Conexiones Externas', subgroup: 'Avanzado' },
  { id: 'integraciones-ia', label: 'Inteligencia Artificial', icon: 'psychology', parent: 'Conexiones Externas', subgroup: 'Avanzado' },

  // Seguridad
  { id: 'seguridad', label: 'Doble factor (2FA)', icon: 'shield', parent: 'Seguridad' },

  // Sistema
  { id: 'versiones', label: 'Gestión de versiones', icon: 'account_tree', parent: 'Sistema' },
];

const categoryOrder = ['Mi Centro', 'Portal de Contactos', 'Pagos y Facturación', 'Comunicaciones', 'Conexiones Externas', 'Seguridad', 'Sistema'];

export default function Settings() {
  const { center, isLoading, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>('centro-info');
  const [expandedCategory, setExpandedCategory] = useState<string>('Mi Centro');

  const selectSection = (id: SettingsSection) => {
    setActiveSection(id);
    const parent = navItems.find((item) => item.id === id)?.parent;
    if (parent) setExpandedCategory(parent);
  };

  const centerForm = useForm<CenterFormValues>({
    resolver: zodResolver(centerSchema),
    values: {
      name: center?.name || '',
      tax_id: center?.tax_id || '',
      address: center?.address || '',
      city: center?.city || '',
      postal_code: center?.postal_code || '',
      phone: center?.phone || '',
      email: center?.email || '',
    },
  });

  const onCenterSubmit = (data: CenterFormValues) => {
    updateCenter.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group nav items by parent and subgroup
  const groupedNavItems = navItems.reduce((acc, item) => {
    const key = item.parent;
    if (!acc[key]) acc[key] = { items: [], subgroups: {} };
    
    if (item.subgroup) {
      if (!acc[key].subgroups[item.subgroup]) {
        acc[key].subgroups[item.subgroup] = [];
      }
      acc[key].subgroups[item.subgroup].push(item);
    } else {
      acc[key].items.push(item);
    }
    return acc;
  }, {} as Record<string, { items: NavItem[], subgroups: Record<string, NavItem[]> }>);

  const renderContent = () => {
    switch (activeSection) {
      case 'centro-info':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Datos del Centro</CardTitle>
              <CardDescription>
                Información básica de tu centro de psicología
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={centerForm.handleSubmit(onCenterSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del Centro *</Label>
                    <Input
                      id="name"
                      {...centerForm.register('name')}
                      placeholder="Centro de Psicología"
                    />
                    {centerForm.formState.errors.name && (
                      <p className="text-sm text-destructive">
                        {centerForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">NIF/CIF</Label>
                    <Input
                      id="tax_id"
                      {...centerForm.register('tax_id')}
                      placeholder="B12345678"
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      {...centerForm.register('phone')}
                      placeholder="+34 612 345 678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      {...centerForm.register('email')}
                      placeholder="contacto@centro.com"
                    />
                    {centerForm.formState.errors.email && (
                      <p className="text-sm text-destructive">
                        {centerForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Dirección</h4>
                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input
                      id="address"
                      {...centerForm.register('address')}
                      placeholder="Calle Principal, 123"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">Ciudad</Label>
                      <Input
                        id="city"
                        {...centerForm.register('city')}
                        placeholder="Madrid"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postal_code">Código Postal</Label>
                      <Input
                        id="postal_code"
                        {...centerForm.register('postal_code')}
                        placeholder="28001"
                      />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex justify-end">
                    <Button type="submit" disabled={updateCenter.isPending}>
                      {updateCenter.isPending ? (
                        <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Icon name="save" className="mr-2 h-4 w-4" />
                      )}
                      Guardar Cambios
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        );
      case 'centro-ubicaciones':
        return <LocationsSection />;
      case 'centro-agenda':
        return <AgendaSettingsSection />;
      case 'centro-excepciones':
        return <ScheduleExceptionsSection />;
      case 'centro-dias-especiales':
        return <SpecialDaysSection />;
      case 'centro-portal':
        return <PortalSettingsSection />;
      case 'sesiones-tipos':
        return <SessionTypesSection />;
      case 'tarifas':
        return <TariffPlansSection />;
      case 'pagos-config':
        return <PaymentSettingsSection />;
      case 'pagos-politica-cancelacion':
        return <CancellationPolicySettingsSection />;
      case 'consentimientos-config':
        return <ConsentSettingsSection />;
      case 'consentimientos-plantillas':
        return <ConsentTemplatesSection />;
      case 'evaluaciones-plantillas':
        return <AssessmentTemplatesSection />;
      case 'autorregistros-plantillas':
        return <AutoregistroTemplatesSection />;
      case 'facturacion-info':
        return <InvoicingInfoSection />;
      case 'facturacion-editar':
        return <InvoiceEditSection />;
      case 'facturacion-series':
        return <InvoiceSeriesSection />;
      case 'facturacion-automatizar':
        return <InvoiceAutomationSection />;
      case 'facturacion-verifactu':
        return <VerifactuConfigSection />;
      case 'facturacion-verifactu-declaracion':
        return <ResponsibleDeclarationSection />;
      case 'facturacion-verifactu-exportar':
        return <VerifactuExportSection />;
      case 'gastos-categorias':
        return <ExpenseCategoriesSection />;
      case 'gastos-recurrentes':
        return <RecurringExpensesSection />;
      case 'gastos-compensacion-profesionales':
        return <ProfessionalCompensationSection />;
      case 'comunicaciones-email':
        return <EmailTemplateEditor />;
      case 'comunicaciones-whatsapp':
        return <WhatsAppTemplateEditor />;
      case 'comunicaciones-sms':
        return <SmsTemplateEditor />;
      case 'comunicaciones-recordatorios':
        return <SessionReminderSettingsSection />;
      case 'comunicaciones-recordatorios-pago':
        return <PaymentReminderTemplateEditor />;
      case 'comunicaciones-alertas-admin':
        return <AdminAlertsSettingsSection />;
      case 'comunicaciones-confirmaciones-cita':
        return <BookingTemplatesEditor />;
      case 'integraciones-resumen':
        return <IntegrationsOverview />;
      case 'integraciones-email':
        return <EmailIntegrationSection />;
      case 'integraciones-credenciales':
        return <OAuthCredentialsSection />;
      case 'integraciones-whatsapp':
        return <WhatsAppIntegrationSection />;
      case 'integraciones-zoom':
        return <ZoomIntegrationSection />;
      case 'integraciones-google':
        return <GoogleIntegrationSection />;
      case 'integraciones-google-drive':
        return <GoogleDriveIntegrationSection />;
      case 'integraciones-stripe':
        return <StripeIntegrationSection onOpenPaymentSettings={() => setActiveSection('pagos-config')} />;
      case 'integraciones-ia':
        return <AISettingsSection />;
      case 'seguridad':
        return <SecuritySection />;
      case 'versiones':
        return <VersionManagementSection />;
      default:
        return null;
    }
  };

  // Get current item label for mobile selector
  const currentItem = navItems.find(item => item.id === activeSection);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">Configuración</h1>
        <p className="mt-1 text-muted-foreground">
          Gestiona la configuración de tu centro
        </p>
      </div>

      {/* Mobile Section Selector */}
      <div className="lg:hidden">
        <Select value={activeSection} onValueChange={(val) => selectSection(val as SettingsSection)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {currentItem && (
                <span className="flex items-center gap-2">
                  <Icon name={currentItem.icon} className="h-4 w-4" />
                  {currentItem.label}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {categoryOrder.map((category) => {
              const group = groupedNavItems[category];
              if (!group) return null;
              
              return (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                    {category}
                  </div>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="flex items-center gap-2">
                        <Icon name={item.icon} className="h-4 w-4" />
                        {item.label}
                      </span>
                    </SelectItem>
                  ))}
                  {Object.entries(group.subgroups).map(([subgroupName, subItems]) => (
                    <div key={subgroupName}>
                      <div className="px-4 py-1 text-xs font-medium text-muted-foreground">
                        {subgroupName}
                      </div>
                      {subItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <span className="flex items-center gap-2 pl-2">
                            <Icon name={item.icon} className="h-4 w-4" />
                            {item.label}
                          </span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Navigation - Hidden on mobile */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Card className="sticky top-6 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-10rem)]">
              <nav className="p-4 space-y-1">
                {categoryOrder.map((category) => {
                  const group = groupedNavItems[category];
                  if (!group) return null;
                  const categoryIcon = categoryIcons[category] || 'description';
                  const isExpanded = expandedCategory === category;

                  return (
                    <div key={category} className="space-y-1">
                      <button
                        onClick={() => setExpandedCategory(isExpanded ? '' : category)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        <Icon name={categoryIcon} className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-left">{category}</span>
                        <Icon
                          name="expand_more"
                          className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>

                      {isExpanded && (
                        <div className="ml-4 space-y-1 border-l pl-4 pb-2">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => selectSection(item.id)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                activeSection === item.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Icon name={item.icon} className="h-4 w-4" />
                              {item.label}
                            </button>
                          ))}

                          {/* Render subgroups */}
                          {Object.entries(group.subgroups).map(([subgroupName, subItems]) => (
                            <div key={subgroupName} className="mt-3 space-y-1">
                              <div className="flex items-center gap-2 px-3 py-1">
                                <Icon name="shield" className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">{subgroupName}</span>
                              </div>
                              <div className="ml-2 space-y-1 border-l border-dashed pl-3">
                                {subItems.map((item) => (
                                  <button
                                    key={item.id}
                                    onClick={() => selectSection(item.id)}
                                    className={cn(
                                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                      activeSection === item.id
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    <Icon name={item.icon} className="h-4 w-4" />
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </ScrollArea>
          </Card>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

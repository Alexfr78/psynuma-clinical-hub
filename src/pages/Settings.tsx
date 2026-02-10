import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Building2, 
  FileText, 
  Save, 
  Loader2,
  Receipt,
  Pencil,
  List,
  Zap,
  MapPin,
  Calendar,
  Mail,
  MessageCircle,
  Smartphone,
  Shield,
  Settings2,
  Video,
  CreditCard,
  Plug,
  Wallet,
  Bell,
  Users,
  FileDown,
  CalendarDays
} from 'lucide-react';
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
import { EmailTemplateEditor } from '@/components/settings/communications/EmailTemplateEditor';
import { WhatsAppTemplateEditor } from '@/components/settings/communications/WhatsAppTemplateEditor';
import { SmsTemplateEditor } from '@/components/settings/communications/SmsTemplateEditor';
import { PaymentReminderTemplateEditor } from '@/components/settings/communications/PaymentReminderTemplateEditor';
import { SessionReminderSettingsSection } from '@/components/settings/SessionReminderSettingsSection';
import { VerifactuConfigSection } from '@/components/settings/VerifactuConfigSection';
import { ResponsibleDeclarationSection } from '@/components/settings/ResponsibleDeclarationSection';
import { VerifactuExportSection } from '@/components/settings/VerifactuExportSection';
import { PortalSettingsSection } from '@/components/settings/PortalSettingsSection';
import { ConsentSettingsSection } from '@/components/settings/ConsentSettingsSection';
import { IntegrationsOverview } from '@/components/settings/integrations/IntegrationsOverview';
import { WhatsAppIntegrationSection } from '@/components/settings/integrations/WhatsAppIntegrationSection';
// WasenderIntegrationSection is now integrated into WhatsAppIntegrationSection
import { ZoomIntegrationSection } from '@/components/settings/integrations/ZoomIntegrationSection';
import { GoogleIntegrationSection } from '@/components/settings/integrations/GoogleIntegrationSection';
import { StripeIntegrationSection } from '@/components/settings/integrations/StripeIntegrationSection';
import { EmailIntegrationSection } from '@/components/settings/integrations/EmailIntegrationSection';
import { OAuthCredentialsSection } from '@/components/settings/integrations/OAuthCredentialsSection';
import { AgendaSettingsSection } from '@/components/settings/AgendaSettingsSection';
import { AdminAlertsSettingsSection } from '@/components/settings/AdminAlertsSettingsSection';

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
  | 'centro-info'
  | 'centro-ubicaciones'
  | 'centro-agenda'
  | 'centro-portal'
  
  | 'sesiones-tipos'
  | 'pagos-config'
  | 'consentimientos-config'
  | 'facturacion-info' 
  | 'facturacion-editar' 
  | 'facturacion-series' 
  | 'facturacion-automatizar'
  | 'facturacion-verifactu'
  | 'facturacion-verifactu-declaracion'
  | 'facturacion-verifactu-exportar'
  | 'comunicaciones-email'
  | 'comunicaciones-whatsapp'
  | 'comunicaciones-sms'
  | 'comunicaciones-recordatorios'
  | 'comunicaciones-recordatorios-pago'
  | 'comunicaciones-alertas-admin'
  | 'integraciones-resumen'
  | 'integraciones-credenciales'
  | 'integraciones-email'
  | 'integraciones-whatsapp'
  
  | 'integraciones-zoom'
  | 'integraciones-google'
  | 'integraciones-stripe';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  parent: string;
  subgroup?: string;
}

// Category icons for main sections
const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Mi Centro': Building2,
  'Portal de Pacientes': Users,
  'Pagos y Facturación': Wallet,
  'Comunicaciones': Mail,
  'Conexiones Externas': Plug,
};

const navItems: NavItem[] = [
  // Mi Centro
  { id: 'centro-info', label: 'Datos del centro', icon: Building2, parent: 'Mi Centro' },
  { id: 'centro-ubicaciones', label: 'Ubicaciones', icon: MapPin, parent: 'Mi Centro' },
  { id: 'centro-agenda', label: 'Configuración de agenda', icon: CalendarDays, parent: 'Mi Centro' },
  { id: 'sesiones-tipos', label: 'Tipos de cita', icon: Calendar, parent: 'Mi Centro' },
  
  // Portal de Pacientes
  { id: 'centro-portal', label: 'Configuración del portal', icon: Settings2, parent: 'Portal de Pacientes' },
  
  { id: 'consentimientos-config', label: 'Consentimientos informados', icon: FileText, parent: 'Portal de Pacientes' },
  
  // Pagos y Facturación
  { id: 'pagos-config', label: 'Métodos de cobro', icon: Wallet, parent: 'Pagos y Facturación' },
  { id: 'facturacion-info', label: 'Datos fiscales', icon: Receipt, parent: 'Pagos y Facturación' },
  { id: 'facturacion-editar', label: 'Personalizar facturas', icon: Pencil, parent: 'Pagos y Facturación' },
  { id: 'facturacion-series', label: 'Series de facturas', icon: List, parent: 'Pagos y Facturación' },
  { id: 'facturacion-automatizar', label: 'Facturación automática', icon: Zap, parent: 'Pagos y Facturación' },
  // Verifactu subgroup
  { id: 'facturacion-verifactu', label: 'Certificado digital', icon: Shield, parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  { id: 'facturacion-verifactu-declaracion', label: 'Declaración responsable', icon: FileText, parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  { id: 'facturacion-verifactu-exportar', label: 'Exportar registros', icon: FileDown, parent: 'Pagos y Facturación', subgroup: 'Verifactu (AEAT)' },
  
  // Comunicaciones
  { id: 'comunicaciones-recordatorios', label: 'Recordatorios de cita', icon: Bell, parent: 'Comunicaciones' },
  { id: 'comunicaciones-recordatorios-pago', label: 'Recordatorios de pago', icon: Wallet, parent: 'Comunicaciones' },
  { id: 'comunicaciones-alertas-admin', label: 'Alertas al profesional', icon: Bell, parent: 'Comunicaciones' },
  { id: 'comunicaciones-email', label: 'Plantillas de email', icon: Mail, parent: 'Comunicaciones' },
  { id: 'comunicaciones-whatsapp', label: 'Plantillas de WhatsApp', icon: MessageCircle, parent: 'Comunicaciones' },
  { id: 'comunicaciones-sms', label: 'Plantillas de SMS', icon: Smartphone, parent: 'Comunicaciones' },
  
  // Conexiones Externas
  { id: 'integraciones-resumen', label: 'Estado de conexiones', icon: Plug, parent: 'Conexiones Externas' },
  { id: 'integraciones-email', label: 'Email (Resend)', icon: Mail, parent: 'Conexiones Externas' },
  { id: 'integraciones-whatsapp', label: 'WhatsApp', icon: MessageCircle, parent: 'Conexiones Externas' },
  { id: 'integraciones-google', label: 'Google Calendar y Meet', icon: Calendar, parent: 'Conexiones Externas' },
  { id: 'integraciones-zoom', label: 'Zoom', icon: Video, parent: 'Conexiones Externas' },
  { id: 'integraciones-stripe', label: 'Stripe - Cobros online', icon: CreditCard, parent: 'Conexiones Externas' },
  { id: 'integraciones-credenciales', label: 'Configuración avanzada', icon: Settings2, parent: 'Conexiones Externas' },
];

// Order of main categories
const categoryOrder = ['Mi Centro', 'Portal de Pacientes', 'Pagos y Facturación', 'Comunicaciones', 'Conexiones Externas'];

export default function Settings() {
  const { center, isLoading, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>('centro-info');

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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
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
      case 'centro-portal':
        return <PortalSettingsSection />;
      case 'sesiones-tipos':
        return <SessionTypesSection />;
      case 'pagos-config':
        return <PaymentSettingsSection />;
      case 'consentimientos-config':
        return <ConsentSettingsSection />;
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
      case 'integraciones-stripe':
        return <StripeIntegrationSection />;
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
        <Select value={activeSection} onValueChange={(val) => setActiveSection(val as SettingsSection)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {currentItem && (
                <span className="flex items-center gap-2">
                  <currentItem.icon className="h-4 w-4" />
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
                        <item.icon className="h-4 w-4" />
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
                            <item.icon className="h-4 w-4" />
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
              <nav className="p-4 space-y-6">
                {categoryOrder.map((category) => {
                  const group = groupedNavItems[category];
                  if (!group) return null;
                  const CategoryIcon = categoryIcons[category] || FileText;
                  
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{category}</span>
                      </div>
                      <div className="ml-4 space-y-1 border-l pl-4">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              activeSection === item.id
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        ))}
                        
                        {/* Render subgroups */}
                        {Object.entries(group.subgroups).map(([subgroupName, subItems]) => (
                          <div key={subgroupName} className="mt-3 space-y-1">
                            <div className="flex items-center gap-2 px-3 py-1">
                              <Shield className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">{subgroupName}</span>
                            </div>
                            <div className="ml-2 space-y-1 border-l border-dashed pl-3">
                              {subItems.map((item) => (
                                <button
                                  key={item.id}
                                  onClick={() => setActiveSection(item.id)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                    activeSection === item.id
                                      ? "bg-primary text-primary-foreground"
                                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <item.icon className="h-4 w-4" />
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
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

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
  Wallet
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
import { VerifactuConfigSection } from '@/components/settings/VerifactuConfigSection';
import { ResponsibleDeclarationSection } from '@/components/settings/ResponsibleDeclarationSection';
import { VerifactuExportSection } from '@/components/settings/VerifactuExportSection';
import { PortalSettingsSection } from '@/components/settings/PortalSettingsSection';
import { ConsentSettingsSection } from '@/components/settings/ConsentSettingsSection';
import { IntegrationsOverview } from '@/components/settings/integrations/IntegrationsOverview';
import { WhatsAppIntegrationSection } from '@/components/settings/integrations/WhatsAppIntegrationSection';
import { ZoomIntegrationSection } from '@/components/settings/integrations/ZoomIntegrationSection';
import { GoogleIntegrationSection } from '@/components/settings/integrations/GoogleIntegrationSection';
import { StripeIntegrationSection } from '@/components/settings/integrations/StripeIntegrationSection';
import { OAuthCredentialsSection } from '@/components/settings/integrations/OAuthCredentialsSection';

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
  | 'integraciones-resumen'
  | 'integraciones-credenciales'
  | 'integraciones-whatsapp'
  | 'integraciones-zoom'
  | 'integraciones-google'
  | 'integraciones-stripe';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  parent?: string;
}

const navItems: NavItem[] = [
  { id: 'centro-info', label: 'Datos del centro', icon: Building2, parent: 'Centro' },
  { id: 'centro-ubicaciones', label: 'Ubicaciones', icon: MapPin, parent: 'Centro' },
  { id: 'centro-portal', label: 'Ajustes del Portal', icon: Settings2, parent: 'Centro' },
  { id: 'sesiones-tipos', label: 'Tipos de sesión', icon: Calendar, parent: 'Sesiones' },
  { id: 'pagos-config', label: 'Configuración de pagos', icon: Wallet, parent: 'Pagos' },
  { id: 'consentimientos-config', label: 'Días de expiración', icon: FileText, parent: 'Consentimientos' },
  { id: 'facturacion-info', label: 'Información de facturación', icon: Receipt, parent: 'Facturación' },
  { id: 'facturacion-editar', label: 'Editar factura', icon: Pencil, parent: 'Facturación' },
  { id: 'facturacion-series', label: 'Series y numeración', icon: List, parent: 'Facturación' },
  { id: 'facturacion-automatizar', label: 'Automatizar facturas', icon: Zap, parent: 'Facturación' },
  { id: 'facturacion-verifactu', label: 'Verifactu (AEAT)', icon: Shield, parent: 'Facturación' },
  { id: 'facturacion-verifactu-declaracion', label: 'Declaración Responsable', icon: FileText, parent: 'Facturación' },
  { id: 'facturacion-verifactu-exportar', label: 'Exportar Registros', icon: FileText, parent: 'Facturación' },
  { id: 'comunicaciones-email', label: 'Plantillas Email', icon: Mail, parent: 'Comunicaciones' },
  { id: 'comunicaciones-whatsapp', label: 'Plantillas WhatsApp', icon: MessageCircle, parent: 'Comunicaciones' },
  { id: 'comunicaciones-sms', label: 'Plantillas SMS', icon: Smartphone, parent: 'Comunicaciones' },
  { id: 'integraciones-resumen', label: 'Resumen', icon: Plug, parent: 'Integraciones' },
  { id: 'integraciones-credenciales', label: 'Credenciales OAuth', icon: Shield, parent: 'Integraciones' },
  { id: 'integraciones-whatsapp', label: 'WhatsApp Business', icon: MessageCircle, parent: 'Integraciones' },
  { id: 'integraciones-zoom', label: 'Zoom', icon: Video, parent: 'Integraciones' },
  { id: 'integraciones-google', label: 'Google Calendar/Meet', icon: Calendar, parent: 'Integraciones' },
  { id: 'integraciones-stripe', label: 'Stripe', icon: CreditCard, parent: 'Integraciones' },
];

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

  // Group nav items by parent
  const groupedNavItems = navItems.reduce((acc, item) => {
    const key = item.parent || 'root';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

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
      case 'integraciones-resumen':
        return <IntegrationsOverview />;
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
            <SelectValue placeholder="Selecciona una sección" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedNavItems).map(([group, items]) => (
              items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {group} - {item.label}
                  </span>
                </SelectItem>
              ))
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Navigation - Hidden on mobile */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Card className="sticky top-6 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-10rem)]">
              <nav className="p-4 space-y-6">
                {Object.entries(groupedNavItems).map(([group, items]) => (
                  <div key={group} className="space-y-1">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{group}</span>
                    </div>
                    <div className="ml-4 space-y-1 border-l pl-4">
                      {items.map((item) => (
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

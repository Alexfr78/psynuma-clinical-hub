import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Building2, FileText, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';

const centerSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
});

const invoiceSchema = z.object({
  invoice_prefix: z.string().min(1, 'El prefijo es obligatorio'),
  invoice_next_number: z.coerce.number().min(1, 'Número debe ser mayor a 0'),
});

type CenterFormValues = z.infer<typeof centerSchema>;
type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function Settings() {
  const { center, isLoading, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('center');

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

  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    values: {
      invoice_prefix: center?.invoice_prefix || 'FAC',
      invoice_next_number: center?.invoice_next_number || 1,
    },
  });

  const onCenterSubmit = (data: CenterFormValues) => {
    updateCenter.mutate(data);
  };

  const onInvoiceSubmit = (data: InvoiceFormValues) => {
    updateCenter.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">Configuración</h1>
        <p className="mt-1 text-muted-foreground">
          Gestiona la configuración de tu centro
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="center" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Centro
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Facturación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="center" className="mt-6">
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
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Facturación</CardTitle>
              <CardDescription>
                Configura la numeración y prefijos de tus facturas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={invoiceForm.handleSubmit(onInvoiceSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invoice_prefix">Prefijo de Factura</Label>
                    <Input
                      id="invoice_prefix"
                      {...invoiceForm.register('invoice_prefix')}
                      placeholder="FAC"
                    />
                    {invoiceForm.formState.errors.invoice_prefix && (
                      <p className="text-sm text-destructive">
                        {invoiceForm.formState.errors.invoice_prefix.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Este prefijo se usará para todas las facturas nuevas
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_next_number">Próximo Número de Factura</Label>
                    <Input
                      id="invoice_next_number"
                      type="number"
                      {...invoiceForm.register('invoice_next_number')}
                      min={1}
                    />
                    {invoiceForm.formState.errors.invoice_next_number && (
                      <p className="text-sm text-destructive">
                        {invoiceForm.formState.errors.invoice_next_number.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      La próxima factura será: {invoiceForm.watch('invoice_prefix')}-
                      {String(invoiceForm.watch('invoice_next_number')).padStart(5, '0')}
                    </p>
                  </div>
                </div>

                <Card className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <h4 className="font-medium">Cumplimiento Verifactu</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Las facturas emitidas se sellan automáticamente con hash SHA-256 
                          para cumplir con los requisitos de Verifactu. El sello incluye 
                          marca de tiempo y firma digital.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
        </TabsContent>
      </Tabs>
    </div>
  );
}

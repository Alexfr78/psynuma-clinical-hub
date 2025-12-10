import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';

const invoicingInfoSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  address_details: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  default_tax_name: z.string().optional(),
  default_tax_rate: z.coerce.number().min(0).max(100).optional(),
  include_tax_in_price: z.boolean().optional(),
  retention_name: z.string().optional(),
  retention_rate: z.coerce.number().min(0).max(100).optional(),
});

type InvoicingInfoFormValues = z.infer<typeof invoicingInfoSchema>;

export function InvoicingInfoSection() {
  const { center, updateCenter } = useCenter();
  const { isAdmin } = useAuth();

  const form = useForm<InvoicingInfoFormValues>({
    resolver: zodResolver(invoicingInfoSchema),
    values: {
      name: center?.name || '',
      tax_id: center?.tax_id || '',
      address: center?.address || '',
      address_details: center?.address_details || '',
      city: center?.city || '',
      postal_code: center?.postal_code || '',
      country: center?.country || 'España',
      province: center?.province || '',
      default_tax_name: center?.default_tax_name || 'IVA',
      default_tax_rate: center?.default_tax_rate || 21,
      include_tax_in_price: center?.include_tax_in_price || false,
      retention_name: center?.retention_name || 'IRPF',
      retention_rate: center?.retention_rate || 0,
    },
  });

  const onSubmit = (data: InvoicingInfoFormValues) => {
    updateCenter.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información de facturación</CardTitle>
        <CardDescription>
          Datos fiscales que aparecerán en tus facturas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Datos fiscales */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Datos fiscales
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre o razón social *</Label>
                <Input
                  id="name"
                  {...form.register('name')}
                  placeholder="Centro de Psicología S.L."
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_id">NIF/CIF</Label>
                <Input
                  id="tax_id"
                  {...form.register('tax_id')}
                  placeholder="B12345678"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Dirección */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Dirección
            </h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  {...form.register('address')}
                  placeholder="Calle Principal, 123"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_details">Datos de dirección (Nº, piso, puerta...)</Label>
                <Input
                  id="address_details"
                  {...form.register('address_details')}
                  placeholder="Piso 2, Puerta A"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">Ciudad</Label>
                  <Input
                    id="city"
                    {...form.register('city')}
                    placeholder="Madrid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Código Postal</Label>
                  <Input
                    id="postal_code"
                    {...form.register('postal_code')}
                    placeholder="28001"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    {...form.register('country')}
                    placeholder="España"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province">Provincia</Label>
                  <Input
                    id="province"
                    {...form.register('province')}
                    placeholder="Madrid"
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Impuestos */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Impuestos y retenciones
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default_tax_name">Nombre del impuesto</Label>
                <Input
                  id="default_tax_name"
                  {...form.register('default_tax_name')}
                  placeholder="IVA"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_tax_rate">Porcentaje (%)</Label>
                <Input
                  id="default_tax_rate"
                  type="number"
                  step="0.01"
                  {...form.register('default_tax_rate')}
                  placeholder="21"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include_tax_in_price"
                checked={form.watch('include_tax_in_price')}
                onCheckedChange={(checked) => form.setValue('include_tax_in_price', !!checked)}
              />
              <Label htmlFor="include_tax_in_price" className="text-sm font-normal">
                Incluir impuesto en el precio del ítem
              </Label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="retention_name">Nombre de retención</Label>
                <Input
                  id="retention_name"
                  {...form.register('retention_name')}
                  placeholder="IRPF"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retention_rate">Porcentaje retención (%)</Label>
                <Input
                  id="retention_rate"
                  type="number"
                  step="0.01"
                  {...form.register('retention_rate')}
                  placeholder="15"
                />
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={updateCenter.isPending}>
                {updateCenter.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

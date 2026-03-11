import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Loader2, Upload, X, Image, FileText, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const invoiceEditSchema = z.object({
  invoice_footer: z.string().optional(),
  invoice_data_protection_text: z.string().optional(),
});

type InvoiceEditFormValues = z.infer<typeof invoiceEditSchema>;

export function InvoiceEditSection() {
  const { center, updateCenter, centerId } = useCenter();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('logo');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InvoiceEditFormValues>({
    resolver: zodResolver(invoiceEditSchema),
    values: {
      invoice_footer: center?.invoice_footer || '',
      invoice_data_protection_text: center?.invoice_data_protection_text || '',
    },
  });

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !centerId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona una imagen válida');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no puede superar 2MB');
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${centerId}/logo.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('invoice-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('invoice-logos')
        .getPublicUrl(fileName);

      // Update center with logo URL
      await updateCenter.mutateAsync({ invoice_logo_url: publicUrl });
      toast.success('Logo actualizado correctamente');
    } catch (error: any) {
      toast.error('Error al subir el logo: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!centerId || !center?.invoice_logo_url) return;

    try {
      // Extract file path from URL
      const urlParts = center.invoice_logo_url.split('/');
      const fileName = urlParts.slice(-2).join('/');

      // Remove from storage
      await supabase.storage.from('invoice-logos').remove([fileName]);

      // Update center
      await updateCenter.mutateAsync({ invoice_logo_url: null });
      toast.success('Logo eliminado correctamente');
    } catch (error: any) {
      toast.error('Error al eliminar el logo: ' + error.message);
    }
  };

  const onSubmit = (data: InvoiceEditFormValues) => {
    updateCenter.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editar factura</CardTitle>
        <CardDescription>
          Personaliza el aspecto de tus facturas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="logo" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Logo
            </TabsTrigger>
            <TabsTrigger value="footer" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Pie de página
            </TabsTrigger>
            <TabsTrigger value="data-protection" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              RGPD
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logo" className="mt-6 space-y-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                El logo aparecerá en la cabecera de tus facturas. Recomendamos una imagen de máximo 1000px de ancho.
              </p>

              {center?.invoice_logo_url ? (
                <div className="space-y-4">
                  <div className="relative inline-block">
                    <img
                      src={center.invoice_logo_url}
                      alt="Logo de factura"
                      className="max-h-32 max-w-xs rounded-lg border bg-background object-contain p-2"
                    />
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -right-2 -top-2 h-6 w-6"
                        onClick={handleRemoveLogo}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {isAdmin && (
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Cambiar logo
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                isAdmin && (
                  <div
                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          Haz clic para subir tu logo
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG hasta 2MB
                        </p>
                      </>
                    )}
                  </div>
                )
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          </TabsContent>

          <TabsContent value="footer" className="mt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_footer">Pie de página</Label>
                <Textarea
                  id="invoice_footer"
                  {...form.register('invoice_footer')}
                  placeholder="Texto que aparecerá al final de todas tus facturas..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Este texto aparecerá en la parte inferior de todas tus facturas. 
                  Ideal para condiciones de pago, información bancaria, etc.
                </p>
              </div>

              {isAdmin && (
                <div className="flex justify-end">
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
          </TabsContent>
          <TabsContent value="data-protection" className="mt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_data_protection_text">Texto de protección de datos</Label>
                <Textarea
                  id="invoice_data_protection_text"
                  {...form.register('invoice_data_protection_text')}
                  placeholder="De conformidad con la normativa vigente en materia de protección de datos..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Este texto aparecerá al final de todas tus facturas (vista web, PDF e impresión).
                  Ideal para cláusulas de protección de datos / RGPD. Si se deja vacío, no se mostrará.
                </p>
              </div>

              {isAdmin && (
                <div className="flex justify-end">
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

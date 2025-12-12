import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Loader2, Upload, Shield, AlertTriangle, CheckCircle2, FileKey, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const verifactuSchema = z.object({
  verifactu_environment: z.enum(['test', 'production']),
  verifactu_software_name: z.string().min(1, 'Nombre fiscal del desarrollador requerido'),
  verifactu_sistema_informatico: z.string().min(1, 'Nombre del sistema requerido').max(30, 'Máximo 30 caracteres'),
  verifactu_software_version: z.string().min(1, 'Versión requerida'),
  verifactu_software_nif: z.string().optional(),
  verifactu_certificate_password: z.string().optional(),
});

type VerifactuFormValues = z.infer<typeof verifactuSchema>;

export function VerifactuConfigSection() {
  const { center, isLoading, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<VerifactuFormValues>({
    resolver: zodResolver(verifactuSchema),
    values: {
      verifactu_environment: (center?.verifactu_environment as 'test' | 'production') || 'test',
      verifactu_software_name: center?.verifactu_software_name || '',
      verifactu_sistema_informatico: (center as any)?.verifactu_sistema_informatico || 'PSYCMA',
      verifactu_software_version: center?.verifactu_software_version || '1.0.0',
      verifactu_software_nif: center?.verifactu_software_nif || '',
      verifactu_certificate_password: '',
    },
  });

  const hasCertificate = !!center?.verifactu_certificate_base64;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.p12') && !file.name.endsWith('.pfx')) {
        toast.error('El archivo debe ser un certificado .p12 o .pfx');
        return;
      }
      setCertificateFile(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const onSubmit = async (data: VerifactuFormValues) => {
    if (!isAdmin) return;

    setIsUploading(true);
    try {
      const updateData: Record<string, any> = {
        verifactu_environment: data.verifactu_environment,
        verifactu_software_name: data.verifactu_software_name,
        verifactu_sistema_informatico: data.verifactu_sistema_informatico,
        verifactu_software_version: data.verifactu_software_version,
        verifactu_software_nif: data.verifactu_software_nif || null,
      };

      // If new certificate file uploaded
      if (certificateFile && data.verifactu_certificate_password) {
        const certificateBase64 = await fileToBase64(certificateFile);
        
        // Encrypt certificate and password using edge function
        const { data: encryptedData, error: encryptError } = await supabase.functions.invoke('encrypt-certificate', {
          body: { 
            certificate_base64: certificateBase64,
            password: data.verifactu_certificate_password 
          }
        });

        if (encryptError || !encryptedData) {
          console.error('Encryption error:', encryptError);
          toast.error('Error al cifrar el certificado');
          setIsUploading(false);
          return;
        }

        updateData.verifactu_certificate_base64 = encryptedData.encrypted_certificate;
        updateData.verifactu_certificate_password = encryptedData.encrypted_password;
        console.log('Certificate encrypted with AES-256-GCM');
      } else if (data.verifactu_certificate_password && hasCertificate) {
        // Update password only - encrypt just the new password
        // Note: We use a dummy certificate value since we only need the encrypted password
        const { data: encryptedData, error: encryptError } = await supabase.functions.invoke('encrypt-certificate', {
          body: { 
            certificate_base64: 'dummy', // We only need the password encrypted
            password: data.verifactu_certificate_password 
          }
        });

        if (encryptError || !encryptedData) {
          console.error('Encryption error:', encryptError);
          toast.error('Error al cifrar la contraseña');
          setIsUploading(false);
          return;
        }

        // Only update the password, keep the existing encrypted certificate
        updateData.verifactu_certificate_password = encryptedData.encrypted_password;
      }

      await updateCenter.mutateAsync(updateData);
      setCertificateFile(null);
      form.setValue('verifactu_certificate_password', '');
      toast.success('Configuración de Verifactu guardada');
    } catch (error) {
      console.error('Error saving Verifactu config:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsUploading(false);
    }
  };

  const removeCertificate = async () => {
    if (!isAdmin) return;
    
    try {
      await updateCenter.mutateAsync({
        verifactu_certificate_base64: null,
        verifactu_certificate_password: null,
      });
      toast.success('Certificado eliminado');
    } catch (error) {
      toast.error('Error al eliminar el certificado');
    }
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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Configuración Verifactu</CardTitle>
          </div>
          <CardDescription>
            Configura tu certificado digital y opciones de Verifactu para la firma electrónica de facturas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Environment Selection */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                Entorno de envío
                <Badge variant={form.watch('verifactu_environment') === 'production' ? 'default' : 'secondary'}>
                  {form.watch('verifactu_environment') === 'production' ? 'Producción' : 'Pruebas'}
                </Badge>
              </h4>
              
              <div className="space-y-2">
                <Label htmlFor="verifactu_environment">Entorno AEAT</Label>
                <Select
                  value={form.watch('verifactu_environment')}
                  onValueChange={(value: 'test' | 'production') => form.setValue('verifactu_environment', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el entorno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Pruebas (pre-producción)
                      </div>
                    </SelectItem>
                    <SelectItem value="production">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Producción
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Usa el entorno de pruebas para verificar que todo funciona antes de enviar a producción
                </p>
              </div>
            </div>

            <Separator />

            {/* Certificate Upload */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <FileKey className="h-4 w-4" />
                Certificado Digital
              </h4>

              {hasCertificate ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertTitle>Certificado configurado</AlertTitle>
                  <AlertDescription className="flex items-center justify-between">
                    <span>Tienes un certificado digital configurado para firmar facturas.</span>
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={removeCertificate}>
                        Eliminar
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Sin certificado</AlertTitle>
                  <AlertDescription>
                    Necesitas subir tu certificado digital (.p12 o .pfx) para poder firmar facturas con Verifactu.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="certificate">
                    {hasCertificate ? 'Reemplazar certificado' : 'Subir certificado'} (.p12 / .pfx)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      ref={fileInputRef}
                      id="certificate"
                      type="file"
                      accept=".p12,.pfx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {certificateFile ? certificateFile.name : 'Seleccionar archivo'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifactu_certificate_password">Contraseña del certificado</Label>
                  <Input
                    id="verifactu_certificate_password"
                    type="password"
                    {...form.register('verifactu_certificate_password')}
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-muted-foreground">
                    {certificateFile 
                      ? 'Introduce la contraseña del nuevo certificado' 
                      : hasCertificate 
                        ? 'Deja vacío para mantener la actual' 
                        : 'Introduce la contraseña del certificado'}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Software Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Información del Software de Facturación</h4>
              <p className="text-sm text-muted-foreground">
                Datos requeridos por la AEAT para identificar el sistema de facturación
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="verifactu_software_name">Nombre fiscal del desarrollador</Label>
                  <Input
                    id="verifactu_software_name"
                    {...form.register('verifactu_software_name')}
                    placeholder="Ej: Jose García López"
                  />
                  <p className="text-xs text-muted-foreground">
                    NombreRazon: debe coincidir exactamente con el censo de la AEAT
                  </p>
                  {form.formState.errors.verifactu_software_name && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.verifactu_software_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifactu_software_nif">NIF del desarrollador</Label>
                  <Input
                    id="verifactu_software_nif"
                    {...form.register('verifactu_software_nif')}
                    placeholder="Ej: 12345678A"
                  />
                  <p className="text-xs text-muted-foreground">
                    Si se deja vacío, se usará el NIF del centro
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="verifactu_sistema_informatico">
                    Nombre del sistema informático
                    <span className="ml-1 text-xs text-muted-foreground">(máx. 30 caracteres)</span>
                  </Label>
                  <Input
                    id="verifactu_sistema_informatico"
                    {...form.register('verifactu_sistema_informatico')}
                    placeholder="Ej: PSYCMA"
                    maxLength={30}
                  />
                  <p className="text-xs text-muted-foreground">
                    NombreSistemaInformatico: nombre comercial del software
                  </p>
                  {form.formState.errors.verifactu_sistema_informatico && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.verifactu_sistema_informatico.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verifactu_software_version">Versión</Label>
                  <Input
                    id="verifactu_software_version"
                    {...form.register('verifactu_software_version')}
                    placeholder="1.0.0"
                  />
                  {form.formState.errors.verifactu_software_version && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.verifactu_software_version.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isUploading || updateCenter.isPending}
                >
                  {(isUploading || updateCenter.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar configuración
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">¿Qué es Verifactu?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Verifactu es el sistema de la Agencia Tributaria española para verificar la autenticidad 
            de las facturas electrónicas. Permite a tus clientes comprobar que una factura es válida 
            mediante un código QR.
          </p>
          <p>
            Para usar Verifactu necesitas un <strong>certificado digital personal</strong> (el mismo 
            que usas para la declaración de la renta) en formato .p12 o .pfx.
          </p>
          <p>
            Las facturas firmadas con Verifactu se envían directamente a la AEAT y no pueden ser 
            modificadas posteriormente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

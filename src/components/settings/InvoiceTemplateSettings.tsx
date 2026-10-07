import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Icon } from '@/components/ui/icon';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type InvoiceTemplate = 'standard' | 'formal';

// La firma va al bucket privado invoice-documents (no a invoice-logos, que es
// público): generate-invoice-pdf la descarga con la service role.
const SIGNATURE_BUCKET = 'invoice-documents';
const SIGNATURE_PREVIEW_TTL_SECONDS = 60 * 10;

const TEMPLATE_OPTIONS: { value: InvoiceTemplate; label: string; description: string }[] = [
  {
    value: 'standard',
    label: 'Estándar',
    description: 'El formato de siempre: logo y datos del centro arriba, columnas de IVA e IRPF por línea.',
  },
  {
    value: 'formal',
    label: 'Formal (profesional colegiado)',
    description:
      'Datos del emisor con número de colegiación, tabla con bordes, cuadro de totales con "EXENTO*", firma y forma de pago por transferencia.',
  },
];

export function InvoiceTemplateSettings() {
  const { center, updateCenter, centerId } = useCenter();
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [licenseLine, setLicenseLine] = useState('');
  const [exemptionNote, setExemptionNote] = useState('');

  const template = (center?.invoice_template as InvoiceTemplate) || 'standard';
  const signaturePath = center?.invoice_signature_path ?? null;

  useEffect(() => {
    setLicenseLine(center?.invoice_license_line || '');
    setExemptionNote(center?.invoice_tax_exemption_note || '');
  }, [center?.invoice_license_line, center?.invoice_tax_exemption_note]);

  useEffect(() => {
    let cancelled = false;
    if (!signaturePath) {
      setSignaturePreview(null);
      return;
    }
    supabase.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrl(signaturePath, SIGNATURE_PREVIEW_TTL_SECONDS)
      .then(({ data }) => {
        if (!cancelled) setSignaturePreview(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [signaturePath]);

  const handleTemplateChange = (value: InvoiceTemplate) => {
    updateCenter.mutate({ invoice_template: value });
  };

  const handleSaveTexts = () => {
    updateCenter.mutate({
      invoice_license_line: licenseLine.trim() || null,
      invoice_tax_exemption_note: exemptionNote.trim() || null,
    });
  };

  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !centerId) return;

    // pdf-lib solo incrusta PNG y JPG
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('La firma debe ser una imagen PNG o JPG');
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error('La imagen de la firma no puede superar 1MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${centerId}/branding/invoice-signature.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      if (signaturePath && signaturePath !== path) {
        await supabase.storage.from(SIGNATURE_BUCKET).remove([signaturePath]);
      }
      await updateCenter.mutateAsync({ invoice_signature_path: path });
      toast.success('Firma actualizada');
    } catch (error) {
      toast.error('Error al subir la firma: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!signaturePath) return;
    try {
      await supabase.storage.from(SIGNATURE_BUCKET).remove([signaturePath]);
      await updateCenter.mutateAsync({ invoice_signature_path: null });
      toast.success('Firma eliminada');
    } catch (error) {
      toast.error('Error al eliminar la firma: ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-base font-medium">Modelo de factura</Label>
        <RadioGroup
          value={template}
          onValueChange={(value) => handleTemplateChange(value as InvoiceTemplate)}
          disabled={!isAdmin || updateCenter.isPending}
          className="space-y-3"
        >
          {TEMPLATE_OPTIONS.map((option) => (
            <div
              key={option.value}
              className="flex items-start space-x-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <RadioGroupItem value={option.value} id={`invoice-template-${option.value}`} className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor={`invoice-template-${option.value}`} className="cursor-pointer font-medium">
                  {option.label}
                </Label>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          El cambio se aplica a las facturas cuyo PDF se genere a partir de ahora. Los PDF ya generados no cambian.
        </p>
      </div>

      {template === 'formal' && (
        <div className="space-y-6 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="invoice_license_line">Línea de colegiación</Label>
            <Input
              id="invoice_license_line"
              value={licenseLine}
              onChange={(e) => setLicenseLine(e.target.value)}
              placeholder="NÚMERO DE COLEGIADA: M-00000"
              maxLength={120}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Se imprime tal cual bajo la dirección del centro. Déjalo vacío para no mostrarla.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice_tax_exemption_note">Nota de exención de IVA</Label>
            <Textarea
              id="invoice_tax_exemption_note"
              value={exemptionNote}
              onChange={(e) => setExemptionNote(e.target.value)}
              placeholder="Operación exenta de IVA según el artículo 20.Uno.3º de la Ley 37/1992"
              maxLength={300}
              rows={2}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Aparece con un asterisco junto a "EXENTO*" en las facturas sin IVA. Revisa con tu gestoría el artículo que
              corresponde a tu actividad.
            </p>
          </div>

          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={handleSaveTexts} disabled={updateCenter.isPending}>
                {updateCenter.isPending ? (
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icon name="save" className="mr-2 h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Firma</Label>
            <p className="text-sm text-muted-foreground">
              Imagen de la firma (PNG con fondo transparente, preferiblemente). Se guarda de forma privada y solo se usa
              para generar el PDF.
            </p>
            {signaturePath ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-lg border bg-white p-2">
                  {signaturePreview ? (
                    <img src={signaturePreview} alt="Firma de las facturas" className="max-h-24 max-w-xs object-contain" />
                  ) : (
                    <Icon name="progress_activity" className="h-6 w-6 animate-spin text-muted-foreground" />
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Icon name="upload" className="mr-2 h-4 w-4" />
                      Cambiar firma
                    </Button>
                    <Button variant="ghost" onClick={handleRemoveSignature} disabled={uploading}>
                      <Icon name="delete" className="mr-2 h-4 w-4" />
                      Quitar
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              isAdmin && (
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? (
                    <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="upload" className="mr-2 h-4 w-4" />
                  )}
                  Subir firma
                </Button>
              )
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleSignatureUpload}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            La forma de pago se toma de los datos de transferencia de Pagos y Facturación → Métodos de cobro; el teléfono,
            el correo y el texto RGPD, de la información del centro y de la pestaña RGPD.
          </p>
        </div>
      )}
    </div>
  );
}

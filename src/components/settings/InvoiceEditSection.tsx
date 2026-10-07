import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoicePdfPreview } from '@/components/settings/InvoicePdfPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { MAX_LOGO_BYTES, useInvoiceDesignPreview, useInvoiceLogo, useInvoiceSignature, useInvoiceSignatureUrl, useSaveInvoiceDesign } from '@/hooks/useInvoiceDesign';
import { diffDesign, designFromCenter, effectiveColor, getTemplateOption, INVOICE_TEMPLATE_OPTIONS, INVOICE_TEXT_LIMITS, isDesignDirty, normalizeDesign, type InvoiceDesignDraft } from '@/lib/invoice-design';
import { cn } from '@/lib/utils';

const PREVIEW_DEBOUNCE_MS = 600;
const FORMAL_SIGNATURE_FIELD = 'invoice_license_line' as const;

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <Label htmlFor={htmlFor} className="pt-2 text-sm font-medium">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PreviewPanel({ draft }: { draft: InvoiceDesignDraft }) {
  const preview = useInvoiceDesignPreview(draft);
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Vista previa</h3>
        <p className="text-sm text-muted-foreground">Factura de muestra · no se guarda</p>
      </div>
      <InvoicePdfPreview bytes={preview.data} isLoading={preview.isLoading} isFetching={preview.isFetching} error={preview.error} />
    </div>
  );
}

export function InvoiceEditSection() {
  const { center } = useCenter();
  const { isAdmin } = useAuth();
  const saved = useMemo(() => designFromCenter(center), [center]);
  const previousSavedRef = useRef(saved);
  const [draft, setDraft] = useState<InvoiceDesignDraft>(() => saved);
  const [debouncedDraft, setDebouncedDraft] = useState<InvoiceDesignDraft>(() => saved);
  const [previewOpen, setPreviewOpen] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const saveDesign = useSaveInvoiceDesign();
  const logo = useInvoiceLogo();
  const signature = useInvoiceSignature();
  const signatureUrl = useInvoiceSignatureUrl();

  useEffect(() => {
    const previousSaved = previousSavedRef.current;
    setDraft((current) => (isDesignDirty(previousSaved, current) ? current : saved));
    previousSavedRef.current = saved;
  }, [saved]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDraft(normalizeDesign(draft)), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const template = getTemplateOption(draft.invoice_template);
  const isDirty = isDesignDirty(saved, draft);
  const showSignature = template.fields.includes(FORMAL_SIGNATURE_FIELD);
  const missingFiscalData = !center?.tax_id || !center?.address;
  const logoBusy = logo.upload.isPending || logo.remove.isPending;
  const signatureBusy = signature.upload.isPending || signature.remove.isPending;

  const setField = <K extends keyof InvoiceDesignDraft>(field: K, value: InvoiceDesignDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>, asset: 'logo' | 'signature') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (asset === 'logo') {
        await logo.upload.mutateAsync(file);
        toast.success('Logotipo actualizado');
      } else {
        await signature.upload.mutateAsync(file);
        toast.success('Firma actualizada');
      }
    } catch (uploadError) {
      toast.error(mutationErrorMessage(uploadError));
    }
  };

  const handleAssetRemove = async (asset: 'logo' | 'signature') => {
    try {
      if (asset === 'logo') {
        await logo.remove.mutateAsync();
        toast.success('Logotipo eliminado');
      } else {
        await signature.remove.mutateAsync();
        toast.success('Firma eliminada');
      }
    } catch (removeError) {
      toast.error(mutationErrorMessage(removeError));
    }
  };

  const handleSave = async () => {
    try {
      await saveDesign.mutateAsync(diffDesign(saved, draft));
      toast.success('Diseño de factura guardado');
    } catch (saveError) {
      toast.error(mutationErrorMessage(saveError));
    }
  };

  const editor = (
    <div className={cn('space-y-7', !isAdmin && 'opacity-80')}>
      <FieldRow label="Diseño">
        <div className="space-y-2">
          <div className="inline-flex w-full rounded-md border bg-muted p-1 sm:w-auto" role="radiogroup" aria-label="Diseño de factura">
            {INVOICE_TEMPLATE_OPTIONS.map((option) => {
              const selected = draft.invoice_template === option.value;
              return (
                <button key={option.value} type="button" role="radio" aria-checked={selected} disabled={!isAdmin} onClick={() => setField('invoice_template', option.value)} className={cn('min-h-10 flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed sm:flex-none', selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </div>
      </FieldRow>

      <FieldRow label="Colores">
        <div className="flex flex-wrap items-start gap-5">
          {(['primary', 'secondary'] as const).map((role) => {
            const id = `invoice-${role}-color`;
            const field = role === 'primary' ? 'invoice_primary_color' : 'invoice_secondary_color';
            return (
              <div key={role} className="max-w-32 space-y-2">
                <div className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-background shadow ring-1 ring-border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <span className="absolute inset-0" style={{ backgroundColor: effectiveColor(draft, role) }} />
                  <input id={id} type="color" value={effectiveColor(draft, role)} onChange={(event) => setField(field, event.target.value)} disabled={!isAdmin} aria-label={`Color ${role === 'primary' ? 'principal' : 'secundario'}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
                </div>
                <Label htmlFor={id} className="block text-xs font-normal text-muted-foreground">{role === 'primary' ? 'Principal' : 'Secundario'}: {template.colorRoles[role]}</Label>
              </div>
            );
          })}
          {isAdmin && <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, invoice_primary_color: null, invoice_secondary_color: null }))}>Restablecer</Button>}
        </div>
      </FieldRow>

      <FieldRow label="Logotipo">
        <div className="space-y-3">
          {center?.invoice_logo_url ? <img src={center.invoice_logo_url} alt="Logotipo actual de la factura" className="h-20 w-40 rounded-md border bg-background object-contain p-2" /> : <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed bg-muted text-sm text-muted-foreground">Sin logotipo</div>}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()} disabled={logoBusy}>{logo.upload.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}{center?.invoice_logo_url ? 'Cambiar' : 'Subir logo'}</Button>
              {center?.invoice_logo_url && <Button type="button" variant="outline" onClick={() => void handleAssetRemove('logo')} disabled={logoBusy}>Quitar</Button>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">PNG/JPG, máx. {MAX_LOGO_BYTES / 1024 / 1024}MB.</p>
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => void handleAssetUpload(event, 'logo')} />
        </div>
      </FieldRow>

      <FieldRow label="Datos del emisor">
        <div className="space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium">{center?.name || 'Nombre del centro sin configurar'}</p>
            <p className="text-muted-foreground">NIF: {center?.tax_id || 'Sin configurar'}</p>
            <p className="text-muted-foreground">{[center?.address, [center?.postal_code, center?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Dirección sin configurar'}</p>
            <p className="text-muted-foreground">{center?.phone || 'Teléfono sin configurar'}</p>
            <p className="text-muted-foreground">{center?.email || 'Email sin configurar'}</p>
          </div>
          <Link to="/configuracion?section=facturacion-info" className="inline-flex min-h-10 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Editar en Datos fiscales</Link>
          {missingFiscalData && <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300" role="status"><Icon name="warning" className="mt-0.5 h-4 w-4" />Faltan datos fiscales obligatorios en la factura</p>}
        </div>
      </FieldRow>

      {template.fields.includes('invoice_license_line') && (
        <FieldRow label="Línea de colegiación" htmlFor="invoice-license-line">
          <Input id="invoice-license-line" value={draft.invoice_license_line ?? ''} onChange={(event) => setField('invoice_license_line', event.target.value)} placeholder="NÚMERO DE COLEGIADA: M-00000" maxLength={INVOICE_TEXT_LIMITS.invoice_license_line} disabled={!isAdmin} />
          <p className="mt-1.5 text-xs text-muted-foreground">Se imprime tal cual bajo la dirección</p>
        </FieldRow>
      )}

      {showSignature && (
        <FieldRow label="Firma">
          <div className="space-y-3">
            {signatureUrl.data ? <img src={signatureUrl.data} alt="Firma actual de la factura" className="h-24 w-48 rounded-md border bg-white object-contain p-2" /> : <div className="flex h-24 w-48 items-center justify-center rounded-md border border-dashed bg-white text-sm text-muted-foreground">Sin firma</div>}
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => signatureInputRef.current?.click()} disabled={signatureBusy}>{signature.upload.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}{center?.invoice_signature_path ? 'Cambiar' : 'Subir firma'}</Button>
                {center?.invoice_signature_path && <Button type="button" variant="outline" onClick={() => void handleAssetRemove('signature')} disabled={signatureBusy}>Quitar</Button>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">PNG con fondo transparente. Se guarda de forma privada y solo la usa el PDF.</p>
            <input ref={signatureInputRef} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => void handleAssetUpload(event, 'signature')} />
          </div>
        </FieldRow>
      )}

      {template.fields.includes('bank_transfer_info') && (
        <FieldRow label="Datos de transferencia" htmlFor="invoice-bank-transfer">
          <Textarea id="invoice-bank-transfer" rows={2} value={draft.bank_transfer_info ?? ''} onChange={(event) => setField('bank_transfer_info', event.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" maxLength={INVOICE_TEXT_LIMITS.bank_transfer_info} disabled={!isAdmin} />
          <p className="mt-1.5 text-xs text-muted-foreground">También se usa en los recordatorios de pago.</p>
        </FieldRow>
      )}

      {template.fields.includes('invoice_tax_exemption_note') && (
        <FieldRow label="Nota de exención de IVA" htmlFor="invoice-tax-exemption-note">
          <Textarea id="invoice-tax-exemption-note" rows={2} value={draft.invoice_tax_exemption_note ?? ''} onChange={(event) => setField('invoice_tax_exemption_note', event.target.value)} placeholder="Operación exenta de IVA según el artículo 20.Uno.3º de la Ley 37/1992" maxLength={INVOICE_TEXT_LIMITS.invoice_tax_exemption_note} disabled={!isAdmin} />
          <p className="mt-1.5 text-xs text-muted-foreground">Aparece con un asterisco junto a "EXENTO*" en las facturas sin IVA. Confirma el artículo con tu gestoría.</p>
        </FieldRow>
      )}

      <FieldRow label="Pie de página" htmlFor="invoice-footer"><Textarea id="invoice-footer" rows={3} value={draft.invoice_footer ?? ''} onChange={(event) => setField('invoice_footer', event.target.value)} maxLength={INVOICE_TEXT_LIMITS.invoice_footer} disabled={!isAdmin} /></FieldRow>
      <FieldRow label="Protección de datos (RGPD)" htmlFor="invoice-data-protection"><Textarea id="invoice-data-protection" rows={4} value={draft.invoice_data_protection_text ?? ''} onChange={(event) => setField('invoice_data_protection_text', event.target.value)} maxLength={INVOICE_TEXT_LIMITS.invoice_data_protection_text} disabled={!isAdmin} /></FieldRow>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalizar facturas</CardTitle>
        <CardDescription>Elige el diseño y los datos que aparecen en tus facturas. La vista previa usa una factura de muestra con los datos de tu centro.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="min-w-0">{editor}</div>
          <div className="hidden lg:block"><div className="sticky top-4"><PreviewPanel draft={debouncedDraft} /></div></div>
          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="lg:hidden">
            <CollapsibleTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" aria-label={`${previewOpen ? 'Ocultar' : 'Mostrar'} vista previa`}>Vista previa<Icon name={previewOpen ? 'expand_less' : 'expand_more'} className="h-5 w-5" /></Button></CollapsibleTrigger>
            <CollapsibleContent className="pt-4"><PreviewPanel draft={debouncedDraft} /></CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">Los cambios se aplican a las facturas cuyo PDF se genere a partir de ahora. Los PDF ya generados no cambian.</p>
        {isAdmin && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isDirty && <span className="text-xs font-medium text-muted-foreground">Cambios sin guardar</span>}
            <Button type="button" variant="outline" onClick={() => setDraft(saved)} disabled={!isDirty || saveDesign.isPending}>Descartar</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || saveDesign.isPending}>{saveDesign.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}Guardar cambios</Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

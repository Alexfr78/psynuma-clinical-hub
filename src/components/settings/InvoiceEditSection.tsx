import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AssetTile } from '@/components/settings/invoice-design/AssetTile';
import { InvoicePdfPreview } from '@/components/settings/InvoicePdfPreview';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { MAX_LOGO_BYTES, useInvoiceDesignPreview, useInvoiceLogo, useInvoiceSignature, useInvoiceSignatureUrl, useSaveInvoiceDesign } from '@/hooks/useInvoiceDesign';
import { diffDesign, designFromCenter, effectiveColor, getTemplateOption, INVOICE_TEMPLATE_OPTIONS, INVOICE_TEXT_LIMITS, isDesignDirty, normalizeDesign, type InvoiceDesignDraft } from '@/lib/invoice-design';
import { cn } from '@/lib/utils';

const PREVIEW_DEBOUNCE_MS = 600;

const SECTION_FIELDS = {
  appearance: ['invoice_template', 'invoice_primary_color', 'invoice_secondary_color'],
  issuer: ['invoice_license_line'],
  payment: ['bank_transfer_info', 'invoice_tax_exemption_note'],
  legal: ['invoice_footer', 'invoice_data_protection_text'],
} as const satisfies Record<string, readonly (keyof InvoiceDesignDraft)[]>;

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>{children}</div>;
}

function SectionHeading({ title, summary, dirty }: { title: string; summary: string; dirty: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3 text-left">
      <span className="shrink-0">{title}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs font-normal text-muted-foreground">{summary}</span>
        {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Cambios sin guardar" />}
      </span>
    </div>
  );
}

function useDesktopMediaQuery() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}

function PreviewPanel({ draft, enabled = true, showHeading = true }: { draft: InvoiceDesignDraft; enabled?: boolean; showHeading?: boolean }) {
  const preview = useInvoiceDesignPreview(draft, enabled);
  return (
    <div className="space-y-3">
      {showHeading && <div><h3 className="font-medium">Vista previa</h3><p className="text-sm text-muted-foreground">Factura de muestra · no se guarda</p></div>}
      <InvoicePdfPreview bytes={preview.data} isLoading={preview.isLoading} isFetching={preview.isFetching} error={preview.error} />
    </div>
  );
}

export function InvoiceEditSection() {
  const { center } = useCenter();
  const { isAdmin } = useAuth();
  const isDesktop = useDesktopMediaQuery();
  const saved = useMemo(() => designFromCenter(center), [center]);
  const previousSavedRef = useRef(saved);
  const [draft, setDraft] = useState<InvoiceDesignDraft>(() => saved);
  const [debouncedDraft, setDebouncedDraft] = useState<InvoiceDesignDraft>(() => saved);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(['appearance']);
  const fiscalDefaultsAppliedRef = useRef(false);
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

  useEffect(() => {
    if (!center || fiscalDefaultsAppliedRef.current) return;
    fiscalDefaultsAppliedRef.current = true;
    if (!center.tax_id || !center.address) setOpenSections((current) => current.includes('issuer') ? current : [...current, 'issuer']);
  }, [center]);

  const template = getTemplateOption(draft.invoice_template);
  const isDirty = isDesignDirty(saved, draft);
  const missingFiscalData = !center?.tax_id || !center?.address;
  const logoBusy = logo.upload.isPending || logo.remove.isPending;
  const signatureBusy = signature.upload.isPending || signature.remove.isPending;
  const normalizedSaved = normalizeDesign(saved);
  const normalizedDraft = normalizeDesign(draft);
  const sectionDirty = (fields: readonly (keyof InvoiceDesignDraft)[]) => fields.some((field) => normalizedSaved[field] !== normalizedDraft[field]);

  const setField = <K extends keyof InvoiceDesignDraft>(field: K, value: InvoiceDesignDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>, asset: 'logo' | 'signature') => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (asset === 'logo') { await logo.upload.mutateAsync(file); toast.success('Logotipo actualizado'); }
      else { await signature.upload.mutateAsync(file); toast.success('Firma actualizada'); }
    } catch (uploadError) { toast.error(mutationErrorMessage(uploadError)); }
  };

  const handleAssetRemove = async (asset: 'logo' | 'signature') => {
    try {
      if (asset === 'logo') { await logo.remove.mutateAsync(); toast.success('Logotipo eliminado'); }
      else { await signature.remove.mutateAsync(); toast.success('Firma eliminada'); }
    } catch (removeError) { toast.error(mutationErrorMessage(removeError)); }
  };

  const handleSave = async () => {
    try { await saveDesign.mutateAsync(diffDesign(saved, draft)); toast.success('Diseño de factura guardado'); }
    catch (saveError) { toast.error(mutationErrorMessage(saveError)); }
  };

  const issuerSummary = [center?.name || 'Sin nombre', center?.tax_id || 'Sin NIF', center?.city || 'Sin ciudad'].join(' · ');
  const appearanceSummary = `${template.label}${center?.invoice_logo_url ? ' · logo' : ''}`;
  const paymentSummary = draft.bank_transfer_info?.trim() ? 'IBAN configurado' : 'Sin IBAN';
  const legalSummary = [draft.invoice_footer?.trim() && 'Pie', draft.invoice_data_protection_text?.trim() && 'RGPD'].filter(Boolean).join(' · ') || 'Sin textos';
  const standardNote = 'La colegiación, la firma y la nota de exención solo se imprimen en el diseño Formal';

  return (
    <Card className="relative">
      <CardHeader className="space-y-1.5">
        <CardTitle>Personalizar facturas</CardTitle>
        <p className="text-sm text-muted-foreground">Los cambios se aplican a los PDF que se generen a partir de ahora; los ya generados no cambian.</p>
      </CardHeader>
      <CardContent className={cn('pb-28 lg:pb-6', !isAdmin && 'opacity-90')}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="min-w-0">
            <AccordionItem value="appearance">
              <AccordionTrigger><SectionHeading title="Apariencia" summary={appearanceSummary} dirty={sectionDirty(SECTION_FIELDS.appearance)} /></AccordionTrigger>
              <AccordionContent className="space-y-4">
                <Field label="Diseño">
                  <div className="space-y-2">
                    <ToggleGroup type="single" variant="outline" value={draft.invoice_template} onValueChange={(value) => value && setField('invoice_template', value as InvoiceDesignDraft['invoice_template'])} disabled={!isAdmin} className="w-full justify-start">
                      {INVOICE_TEMPLATE_OPTIONS.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="min-h-10 min-w-28">{option.label}</ToggleGroupItem>)}
                    </ToggleGroup>
                    <p className="truncate text-sm text-muted-foreground" title={template.description}>{template.description}</p>
                  </div>
                </Field>
                <Field label="Colores">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {(['primary', 'secondary'] as const).map((role) => {
                        const id = `invoice-${role}-color`;
                        const field = role === 'primary' ? 'invoice_primary_color' : 'invoice_secondary_color';
                        return (
                          <label key={role} htmlFor={id} className="relative inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                            <span className="h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: effectiveColor(draft, role) }} />{role === 'primary' ? 'Principal' : 'Secundario'}
                            <input id={id} type="color" value={effectiveColor(draft, role)} onChange={(event) => setField(field, event.target.value)} disabled={!isAdmin} aria-label={`Color ${role === 'primary' ? 'principal' : 'secundario'}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
                          </label>
                        );
                      })}
                      {isAdmin && (draft.invoice_primary_color !== null || draft.invoice_secondary_color !== null) && (
                        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label="Restablecer colores" onClick={() => setDraft((current) => ({ ...current, invoice_primary_color: null, invoice_secondary_color: null }))}><Icon name="restart_alt" className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent>Restablecer colores</TooltipContent></Tooltip>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">Principal: {template.colorRoles.primary} · Secundario: {template.colorRoles.secondary}</p>
                  </div>
                </Field>
                <Field label="Logotipo"><AssetTile accept="image/png,image/jpeg" alt="Logotipo actual de la factura" emptyText="Sin logotipo" formatHint={`PNG/JPG · máx. ${MAX_LOGO_BYTES / 1024 / 1024} MB`} src={center?.invoice_logo_url} busy={logoBusy} readOnly={!isAdmin} onUpload={(event) => void handleAssetUpload(event, 'logo')} onRemove={() => void handleAssetRemove('logo')} /></Field>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="issuer">
              <AccordionTrigger><SectionHeading title="Datos del emisor" summary={missingFiscalData ? 'Falta NIF o dirección' : issuerSummary} dirty={sectionDirty(SECTION_FIELDS.issuer)} /></AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <p className="truncate text-muted-foreground" title={issuerSummary}>{issuerSummary}</p>
                  <Link to="/configuracion?section=facturacion-info" className="inline-flex min-h-10 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Editar en Datos fiscales</Link>
                  {missingFiscalData && <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300" role="status"><Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />Faltan el NIF o la dirección fiscal obligatorios en la factura</p>}
                </div>
                {draft.invoice_template === 'formal' ? (
                  <>
                    <Field label="Línea de colegiación" htmlFor="invoice-license-line"><Input id="invoice-license-line" value={draft.invoice_license_line ?? ''} onChange={(event) => setField('invoice_license_line', event.target.value)} placeholder="NÚMERO DE COLEGIADA: M-00000" maxLength={INVOICE_TEXT_LIMITS.invoice_license_line} disabled={!isAdmin} /></Field>
                    <Field label="Firma"><AssetTile accept="image/png,image/jpeg" alt="Firma actual de la factura" emptyText="Sin firma" formatHint="PNG con fondo transparente" privacyTooltip="Se guarda de forma privada y solo se utiliza para generar el PDF." src={signatureUrl.data} busy={signatureBusy} readOnly={!isAdmin} onUpload={(event) => void handleAssetUpload(event, 'signature')} onRemove={() => void handleAssetRemove('signature')} /></Field>
                  </>
                ) : <p className="text-sm text-muted-foreground">{standardNote}</p>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="payment">
              <AccordionTrigger><SectionHeading title="Pago y fiscalidad" summary={paymentSummary} dirty={sectionDirty(SECTION_FIELDS.payment)} /></AccordionTrigger>
              <AccordionContent className="space-y-4">
                <Field label="Datos de transferencia" htmlFor="invoice-bank-transfer">
                  <Textarea id="invoice-bank-transfer" rows={2} className="[field-sizing:content] max-h-48" value={draft.bank_transfer_info ?? ''} onChange={(event) => setField('bank_transfer_info', event.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" maxLength={INVOICE_TEXT_LIMITS.bank_transfer_info} disabled={!isAdmin} />
                  <p className="text-xs text-muted-foreground">También se usa en los recordatorios de pago</p>
                </Field>
                {draft.invoice_template === 'formal' ? (
                  <Field label="Nota de exención de IVA" htmlFor="invoice-tax-exemption-note">
                    <Textarea id="invoice-tax-exemption-note" rows={2} className="[field-sizing:content] max-h-48" value={draft.invoice_tax_exemption_note ?? ''} onChange={(event) => setField('invoice_tax_exemption_note', event.target.value)} placeholder="Operación exenta de IVA según el artículo 20.Uno.3º de la Ley 37/1992" maxLength={INVOICE_TEXT_LIMITS.invoice_tax_exemption_note} disabled={!isAdmin} />
                    <p className="text-xs text-muted-foreground">Confirma el artículo con tu gestoría</p>
                  </Field>
                ) : <p className="text-sm text-muted-foreground">{standardNote}</p>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="legal">
              <AccordionTrigger><SectionHeading title="Textos legales" summary={legalSummary} dirty={sectionDirty(SECTION_FIELDS.legal)} /></AccordionTrigger>
              <AccordionContent className="space-y-4">
                <Field label="Pie de página" htmlFor="invoice-footer"><Textarea id="invoice-footer" rows={2} className="[field-sizing:content] max-h-48" value={draft.invoice_footer ?? ''} onChange={(event) => setField('invoice_footer', event.target.value)} maxLength={INVOICE_TEXT_LIMITS.invoice_footer} disabled={!isAdmin} /></Field>
                <Field label="Protección de datos (RGPD)" htmlFor="invoice-data-protection"><Textarea id="invoice-data-protection" rows={2} className="[field-sizing:content] max-h-48" value={draft.invoice_data_protection_text ?? ''} onChange={(event) => setField('invoice_data_protection_text', event.target.value)} maxLength={INVOICE_TEXT_LIMITS.invoice_data_protection_text} disabled={!isAdmin} /></Field>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {isDesktop && <div className="min-w-0"><div className="sticky top-4"><PreviewPanel draft={debouncedDraft} /></div></div>}
        </div>
      </CardContent>

      {isAdmin && isDirty && <div className="sticky bottom-0 z-10 hidden items-center justify-between gap-4 border-t bg-background/95 px-6 py-4 backdrop-blur lg:flex"><span className="text-sm font-medium">Cambios sin guardar</span><div className="flex items-center gap-2"><Button type="button" variant="outline" onClick={() => setDraft(saved)} disabled={saveDesign.isPending}>Descartar</Button><Button type="button" onClick={() => void handleSave()} disabled={saveDesign.isPending}>{saveDesign.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}Guardar cambios</Button></div></div>}

      {!isDesktop && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>Vista previa</Button>
            {isAdmin && <Button type="button" className="flex-1" onClick={() => void handleSave()} disabled={!isDirty || saveDesign.isPending}>{saveDesign.isPending && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>}
          </div>
          <Drawer open={previewOpen} onOpenChange={setPreviewOpen}>
            <DrawerContent className="h-[92dvh]">
              <DrawerHeader className="pb-2 text-left"><DrawerTitle>Vista previa de la factura</DrawerTitle><DrawerDescription>Factura de muestra · no se guarda</DrawerDescription></DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]"><PreviewPanel draft={debouncedDraft} enabled={previewOpen} showHeading={false} /></div>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </Card>
  );
}

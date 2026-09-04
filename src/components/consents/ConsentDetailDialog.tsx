import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Consent, useConsentSignatures } from '@/hooks/useConsents';

import { toast } from 'sonner';
import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Icon } from '@/components/ui/icon';
import { getVerificationResponseValue, normalizeVerificationCheckboxes } from '@/lib/consent-checkboxes';

interface ConsentDetailDialogProps {
  consent: Consent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-amber-500' },
  signed: { label: 'Firmado', color: 'bg-green-500' },
  revoked: { label: 'Revocado', color: 'bg-red-500' },
  expired: { label: 'Expirado', color: 'bg-gray-500' },
};

// Fetch full consent with verification responses
function useConsentDetail(consentId: string) {
  return useQuery({
    queryKey: ['consent-detail', consentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consents')
        .select(`
          *,
          template:consent_templates(name, verification_checkboxes, requires_emergency_contact)
        `)
        .eq('id', consentId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
}

// Helper to replace placeholder with verification responses in content
function renderContentWithVerifications(
  content: string,
  rawVerificationCheckboxes: unknown,
  verificationResponses: Record<string, unknown> | null
): string {
  const verificationCheckboxes = normalizeVerificationCheckboxes(rawVerificationCheckboxes);
  if (verificationCheckboxes.length === 0) {
    // Just remove the placeholder
    return content.replace(/\{campos_verificacion\}/gi, '');
  }

  // Build HTML for verification responses
  const responsesHtml = verificationCheckboxes.map((checkbox) => {
    // Handle both boolean and legacy string values from database
    const isAuthorized = getVerificationResponseValue(verificationResponses, checkbox.key) === true;
    const icon = isAuthorized ? '✓' : '✗';
    const color = isAuthorized ? 'color: #16a34a' : 'color: #dc2626';
    const text = isAuthorized ? 'Autorizo' : 'No autorizo';

    return `<div style="margin: 8px 0; padding: 8px; background: #f8fafc; border-radius: 4px; border-left: 3px solid ${isAuthorized ? '#16a34a' : '#dc2626'}">
      <span style="font-weight: 500">${checkbox.label}</span><br/>
      <span style="${color}; font-weight: 600">${icon} ${text}</span>
    </div>`;
  }).join('');
  
  // Replace placeholder
  const patterns = [
    /<div[^>]*>\s*<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>\s*<\/div>/gi,
    /<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>/gi,
    /<div[^>]*>\s*\{campos_verificacion\}\s*<\/div>/gi,
    /<p[^>]*>\s*\{campos_verificacion\}\s*<\/p>/gi,
    /\{campos_verificacion\}/gi,
  ];
  
  let result = content;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, responsesHtml);
      break;
    }
  }
  
  return result;
}

// Helper to replace the emergency contact placeholder with the saved values in content
function renderContentWithEmergencyContact(
  content: string,
  requiresEmergencyContact: boolean,
  emergencyContactName: string | null,
  emergencyContactPhone: string | null
): string {
  if (!requiresEmergencyContact || (!emergencyContactName && !emergencyContactPhone)) {
    return content.replace(/\{contacto_emergencia\}/gi, '');
  }

  const infoHtml = `<div style="margin: 8px 0; padding: 8px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #64748b">
    <span style="font-weight: 500">Contacto de emergencia:</span>
    ${emergencyContactName || '—'} · ${emergencyContactPhone || '—'}
  </div>`;

  const patterns = [
    /<div[^>]*>\s*<span[^>]*>\s*\{contacto_emergencia\}\s*<\/span>\s*<\/div>/gi,
    /<span[^>]*>\s*\{contacto_emergencia\}\s*<\/span>/gi,
    /<div[^>]*>\s*\{contacto_emergencia\}\s*<\/div>/gi,
    /<p[^>]*>\s*\{contacto_emergencia\}\s*<\/p>/gi,
    /\{contacto_emergencia\}/gi,
  ];

  let result = content;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, infoHtml);
      break;
    }
  }

  return result;
}

export function ConsentDetailDialog({
  consent,
  open,
  onOpenChange,
}: ConsentDetailDialogProps) {
  const { signatures, isLoading: signaturesLoading } = useConsentSignatures(consent.id);
  const { data: fullConsent } = useConsentDetail(consent.id);
  const { logView } = useAuditLog();
  const hasLogged = useRef(false);
  const status = statusConfig[consent.status] || statusConfig.pending;
  const isExpired = Boolean(
    consent.expires_at
      && new Date(consent.expires_at) < new Date()
      && consent.status === 'pending',
  );
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (open && consent && !hasLogged.current) {
      hasLogged.current = true;
      logView('consents', consent.id, consent.patient_id);
    }
    if (!open) hasLogged.current = false;
  }, [open, consent, logView]);

  const handleDownloadPdf = async () => {
    if (consent.signed_pdf_url) {
      window.open(consent.signed_pdf_url, '_blank');
      return;
    }
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-consent-pdf', {
        body: { consent_id: consent.id },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No se recibió la URL del PDF');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };
  
  const templateData = fullConsent?.template as { verification_checkboxes: unknown; requires_emergency_contact: boolean | null } | undefined;
  const verificationCheckboxes = normalizeVerificationCheckboxes(templateData?.verification_checkboxes);
  const verificationResponses = (fullConsent?.verification_responses as Record<string, unknown>) || null;
  const isBookingClickwrapAcceptance = fullConsent?.source === 'public_booking_checkbox'
    || fullConsent?.source === 'portal_booking_checkbox';
  const requiresEmergencyContact = Boolean(templateData?.requires_emergency_contact);
  const emergencyContactName = fullConsent?.emergency_contact_name ?? null;
  const emergencyContactPhone = fullConsent?.emergency_contact_phone ?? null;

  // Render content with verification responses and emergency contact
  const renderedContent = renderContentWithEmergencyContact(
    renderContentWithVerifications(
      consent.content_snapshot,
      verificationCheckboxes,
      verificationResponses
    ),
    requiresEmergencyContact,
    emergencyContactName,
    emergencyContactPhone
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {consent.template?.name || 'Consentimiento'}
            <Badge
              variant={consent.status === 'signed' ? 'default' : consent.status === 'revoked' ? 'destructive' : 'secondary'}
              className={consent.status === 'signed' ? 'bg-green-500' : ''}
            >
              {isExpired ? 'Expirado' : status.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Metadata */}
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-medium text-muted-foreground">Contacto</p>
              <p>
                {consent.patient?.first_name} {consent.patient?.last_name}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Profesional</p>
              <p>
                {consent.professional?.first_name} {consent.professional?.last_name}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Creado</p>
              <p>
                {format(new Date(consent.created_at), "d 'de' MMMM 'de' yyyy, HH:mm", {
                  locale: es,
                })}
              </p>
            </div>
            {consent.status === 'pending' && consent.expires_at && (
              <div>
                <p className="font-medium text-muted-foreground">Plazo para firmar</p>
                <p>
                  {format(new Date(consent.expires_at), "d 'de' MMMM 'de' yyyy", {
                    locale: es,
                  })}
                </p>
              </div>
            )}
            {consent.signed_at && (
              <div>
                <p className="font-medium text-muted-foreground">Firmado</p>
                <p>
                  {format(new Date(consent.signed_at), "d 'de' MMMM 'de' yyyy, HH:mm", {
                    locale: es,
                  })}
                </p>
              </div>
            )}
            {consent.revoked_at && (
              <>
                <div>
                  <p className="font-medium text-muted-foreground">Revocado</p>
                  <p>
                    {format(new Date(consent.revoked_at), "d 'de' MMMM 'de' yyyy, HH:mm", {
                      locale: es,
                    })}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="font-medium text-muted-foreground">Motivo de revocación</p>
                  <p>{consent.revocation_reason}</p>
                </div>
              </>
            )}
          </div>

          {/* Verification Responses */}
          {consent.status === 'signed' && verificationCheckboxes.length > 0 && (
            <div className="space-y-3">
              <p className="font-medium">Autorizaciones</p>
              <div className="space-y-2">
                {verificationCheckboxes.map((checkbox) => {
                  // Handle both boolean and legacy string values from database
                  const isAuthorized = getVerificationResponseValue(verificationResponses, checkbox.key) === true;
                  return (
                    <div
                      key={checkbox.key}
                      className={`flex items-start gap-3 rounded-md border p-3 ${
                        isAuthorized
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-red-500/30 bg-red-500/5'
                      }`}
                    >
                      {isAuthorized ? (
                        <Icon name="check_circle" className="h-5 w-5 shrink-0 text-green-600" />
                      ) : (
                        <Icon name="cancel" className="h-5 w-5 shrink-0 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm">{checkbox.label}</p>
                        <p className={`text-xs font-medium ${
                          isAuthorized ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isAuthorized ? 'Autorizado' : 'No autorizado'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          {requiresEmergencyContact && (emergencyContactName || emergencyContactPhone) && (
            <div className="space-y-3">
              <p className="font-medium">Contacto de emergencia</p>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Icon name="call" className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm">{emergencyContactName || 'No indicado'}</p>
                  <p className="text-xs text-muted-foreground">{emergencyContactPhone || 'No indicado'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Document Content - BEFORE Signatures per user requirement */}
          <div className="space-y-2">
            <p className="font-medium">Contenido del documento</p>
            <Card className="max-h-[300px] overflow-auto p-4">
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedContent) }}
              />
            </Card>
          </div>

          {/* Signatures / electronic acceptance - AFTER Document Content */}
          {consent.status === 'signed' && (
            <div className="space-y-3">
              <p className="font-medium">
                {isBookingClickwrapAcceptance ? 'Evidencia de aceptación' : 'Firmas'}
              </p>
              {signaturesLoading ? (
                <div className="flex justify-center py-4">
                  <Icon name="progress_activity" className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {isBookingClickwrapAcceptance && signatures.length === 0 && (
                    <Card className="border-green-500/30 bg-green-500/5 p-3">
                      <div className="flex items-start gap-3">
                        <Icon name="check_circle" className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                        <div>
                          <p className="font-medium">Aceptación electrónica durante la reserva</p>
                          <p className="text-xs text-muted-foreground">
                            El contacto marcó expresamente la casilla de aceptación el{' '}
                            {consent.signed_at
                              ? format(new Date(consent.signed_at), "d MMM yyyy, HH:mm", { locale: es })
                              : 'momento de la reserva'}.
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Este consentimiento se registró mediante casilla, sin firma manuscrita.
                          </p>
                        </div>
                      </div>
                    </Card>
                  )}
                  {signatures.map((sig) => {
                    // Handle "undefined undefined" from legacy signatures
                    const displayName = sig.signer_name === 'undefined undefined' 
                      ? `${consent.patient?.first_name || ''} ${consent.patient?.last_name || ''}`.trim() || 'Contacto'
                      : sig.signer_name;
                    
                    return (
                    <Card key={sig.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {sig.signer_role === 'guardian' ? 'Tutor' : 'Contacto'} •{' '}
                            {format(new Date(sig.signed_at), "d MMM yyyy, HH:mm", { locale: es })}
                          </p>
                        </div>
                        {sig.signature_data && (
                          <img
                            src={sig.signature_data}
                            alt="Firma"
                            className="h-12 max-w-[150px] object-contain"
                          />
                        )}
                      </div>
                      {sig.ip_address && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          IP: {sig.ip_address} • {sig.user_agent?.split(' ')[0]}
                        </p>
                      )}
                    </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={handleDownloadPdf} disabled={generatingPdf}>
              {generatingPdf ? (
                <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icon name="download" className="mr-2 h-4 w-4" />
              )}
              Descargar PDF
            </Button>
            {consent.status === 'pending' && !isExpired && (
              <Button asChild variant="outline">
                <a
                  href={`${window.location.origin}/consentimiento/${consent.access_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="open_in_new" className="mr-2 h-4 w-4" />
                  Abrir portal de firma
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

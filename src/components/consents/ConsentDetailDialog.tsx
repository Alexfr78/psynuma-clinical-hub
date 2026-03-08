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
import { Download, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
          template:consent_templates(name, verification_checkboxes)
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
  verificationCheckboxes: string[] | null,
  verificationResponses: Record<string, boolean> | null
): string {
  if (!verificationCheckboxes || verificationCheckboxes.length === 0) {
    // Just remove the placeholder
    return content.replace(/\{campos_verificacion\}/gi, '');
  }
  
  // Build HTML for verification responses
  const responsesHtml = verificationCheckboxes.map((checkbox, index) => {
    const rawValue = verificationResponses?.[index.toString()];
    // Handle both boolean and string values from database
    const isAuthorized = rawValue === true || String(rawValue) === 'true';
    const icon = isAuthorized ? '✓' : '✗';
    const color = isAuthorized ? 'color: #16a34a' : 'color: #dc2626';
    const text = isAuthorized ? 'Autorizo' : 'No autorizo';
    
    return `<div style="margin: 8px 0; padding: 8px; background: #f8fafc; border-radius: 4px; border-left: 3px solid ${isAuthorized ? '#16a34a' : '#dc2626'}">
      <span style="font-weight: 500">${checkbox}</span><br/>
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

export function ConsentDetailDialog({
  consent,
  open,
  onOpenChange,
}: ConsentDetailDialogProps) {
  const { signatures, isLoading: signaturesLoading } = useConsentSignatures(consent.id);
  const { data: fullConsent } = useConsentDetail(consent.id);
  const status = statusConfig[consent.status] || statusConfig.pending;
  const isExpired = new Date(consent.expires_at) < new Date() && consent.status === 'pending';
  
  const verificationCheckboxes = (fullConsent?.template as any)?.verification_checkboxes || [];
  const verificationResponses = (fullConsent?.verification_responses as Record<string, boolean>) || null;
  
  // Render content with verification responses
  const renderedContent = renderContentWithVerifications(
    consent.content_snapshot,
    verificationCheckboxes,
    verificationResponses
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
            <div>
              <p className="font-medium text-muted-foreground">Expira</p>
              <p>
                {format(new Date(consent.expires_at), "d 'de' MMMM 'de' yyyy", {
                  locale: es,
                })}
              </p>
            </div>
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
                {verificationCheckboxes.map((checkbox: string, index: number) => {
                  // Handle both boolean and string values from database
                  const rawValue = verificationResponses?.[index.toString()];
                  const isAuthorized = rawValue === true || String(rawValue) === 'true';
                  return (
                    <div 
                      key={index} 
                      className={`flex items-start gap-3 rounded-md border p-3 ${
                        isAuthorized 
                          ? 'border-green-500/30 bg-green-500/5' 
                          : 'border-red-500/30 bg-red-500/5'
                      }`}
                    >
                      {isAuthorized ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm">{checkbox}</p>
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

          {/* Signatures - AFTER Document Content */}
          {consent.status === 'signed' && (
            <div className="space-y-3">
              <p className="font-medium">Firmas</p>
              {signaturesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
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
            {consent.status === 'signed' && consent.signed_pdf_url && (
              <Button asChild>
                <a href={consent.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </a>
              </Button>
            )}
            {consent.status === 'pending' && !isExpired && (
              <Button asChild variant="outline">
                <a
                  href={`${window.location.origin}/consentimiento/${consent.access_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Consent, useConsentSignatures } from '@/hooks/useConsents';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sanitizeHtml } from '@/lib/sanitize';

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

export function ConsentDetailDialog({
  consent,
  open,
  onOpenChange,
}: ConsentDetailDialogProps) {
  const { signatures, isLoading: signaturesLoading } = useConsentSignatures(consent.id);
  const status = statusConfig[consent.status] || statusConfig.pending;
  const isExpired = new Date(consent.expires_at) < new Date() && consent.status === 'pending';

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
              <p className="font-medium text-muted-foreground">Paciente</p>
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

          {/* Signatures */}
          {consent.status === 'signed' && (
            <div className="space-y-3">
              <p className="font-medium">Firmas</p>
              {signaturesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {signatures.map((sig) => (
                    <Card key={sig.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{sig.signer_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {sig.signer_role === 'guardian' ? 'Tutor' : 'Paciente'} •{' '}
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
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document Content */}
          <div className="space-y-2">
            <p className="font-medium">Contenido del documento</p>
            <Card className="max-h-[300px] overflow-auto p-4">
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(consent.content_snapshot) }}
              />
            </Card>
          </div>

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

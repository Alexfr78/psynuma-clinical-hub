import { useState } from 'react';
import { FileText, Eye, Download, MoreVertical, XCircle, Send, Copy, ExternalLink, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Consent } from '@/hooks/useConsents';
import { RevokeConsentDialog } from './RevokeConsentDialog';
import { ConsentDetailDialog } from './ConsentDetailDialog';
import { SendConsentDialog } from './SendConsentDialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ConsentCardProps {
  consent: Consent;
}

const statusConfig = {
  pending: { label: 'Pendiente', variant: 'warning' as const, color: 'bg-amber-500' },
  signed: { label: 'Firmado', variant: 'success' as const, color: 'bg-green-500' },
  revoked: { label: 'Revocado', variant: 'destructive' as const, color: 'bg-red-500' },
  expired: { label: 'Expirado', variant: 'secondary' as const, color: 'bg-gray-500' },
};

export function ConsentCard({ consent }: ConsentCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const isUploaded = (consent as any).source === 'uploaded';

  const handleViewUploadedFile = async () => {
    const filePath = (consent as any).uploaded_file_url;
    if (!filePath) return;
    const { data, error } = await supabase.storage
      .from('consent-documents')
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Error al obtener el documento');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDownloadPdf = async () => {
    if (isUploaded) {
      await handleViewUploadedFile();
      return;
    }
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

  const status = statusConfig[consent.status] || statusConfig.pending;
  const isExpired = new Date(consent.expires_at) < new Date() && consent.status === 'pending';
  const displayStatus = isExpired ? statusConfig.expired : status;

  const consentUrl = `${window.location.origin}/consentimiento/${consent.access_token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(consentUrl);
    toast.success('Enlace copiado al portapapeles');
  };

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${displayStatus.color}/10`}>
              <FileText className={`h-5 w-5 ${displayStatus.color.replace('bg-', 'text-')}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold break-words">
                {consent.template?.name || 'Consentimiento'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(consent.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
              </p>
            </div>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" usePortal={false}>
              <DropdownMenuItem onClick={() => setDetailOpen(true)}>
                <Eye className="mr-2 h-4 w-4" />
                Ver documento
              </DropdownMenuItem>
              {consent.status === 'pending' && !isExpired && (
                <>
                  <DropdownMenuItem onClick={() => setSendOpen(true)}>
                    <Send className="mr-2 h-4 w-4" />
                    Reenviar enlace
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar enlace
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={consentUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir portal
                    </a>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={handleDownloadPdf} disabled={generatingPdf}>
                {generatingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Descargar PDF
              </DropdownMenuItem>
              {consent.status === 'signed' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setRevokeOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Revocar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={displayStatus.variant === 'success' ? 'default' : displayStatus.variant === 'warning' ? 'secondary' : 'destructive'}
              className={displayStatus.variant === 'success' ? 'bg-green-500' : displayStatus.variant === 'warning' ? 'bg-amber-500 text-amber-950' : ''}
            >
              {displayStatus.label}
            </Badge>
            {isUploaded && (
              <Badge variant="outline" className="gap-1">
                <Upload className="h-3 w-3" />
                Subido
              </Badge>
            )}
            {consent.requires_guardian && (
              <Badge variant="outline">Multi-firma</Badge>
            )}
            {consent.status === 'pending' && !isExpired && (
              <span className="text-xs text-muted-foreground">
                Expira: {format(new Date(consent.expires_at), 'd MMM', { locale: es })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <ConsentDetailDialog
        consent={consent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <RevokeConsentDialog
        consent={consent}
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
      />

      <SendConsentDialog
        consent={consent}
        open={sendOpen}
        onOpenChange={setSendOpen}
      />
    </>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { usePublicConsent } from '@/hooks/usePublicConsent';
import { MultiSignatureFlow } from '@/components/consents/MultiSignatureFlow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

export default function ConsentSignature() {
  const { token } = useParams<{ token: string }>();
  const { consent, isLoading, error, isExpired } = usePublicConsent(token);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!consent || !token) return;
    if (consent.signed_pdf_url) {
      window.open(consent.signed_pdf_url, '_blank');
      return;
    }
    setDownloadingPdf(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('generate-consent-pdf', {
        body: { consent_id: consent.id, access_token: token },
      });
      if (invokeError || !data?.url) throw invokeError || new Error('No se recibió la URL del PDF');
      window.open(data.url, '_blank');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo descargar el documento. Inténtalo de nuevo más tarde.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Cargando documento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !consent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <Icon name="error" className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">
              Documento no encontrado
            </h2>
            <p className="mt-2 text-muted-foreground">
              El enlace no es válido o ha expirado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isExpired && consent.status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-amber-500/10 p-4">
              <Icon name="schedule" className="h-8 w-8 text-amber-500" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">
              Enlace expirado
            </h2>
            <p className="mt-2 text-muted-foreground">
              Este enlace de firma ha expirado el{' '}
              {format(new Date(consent.expires_at), "d 'de' MMMM 'de' yyyy", { locale: es })}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Contacta con tu profesional para solicitar un nuevo enlace.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (consent.status === 'signed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-green-500/10 p-4">
              <Icon name="check_circle" className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">
              Documento firmado
            </h2>
            <p className="mt-2 text-muted-foreground">
              Este consentimiento fue firmado el{' '}
              {consent.signed_at && format(new Date(consent.signed_at), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}.
            </p>
            <Button className="mt-6" onClick={handleDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? (
                <>
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  Generando documento...
                </>
              ) : (
                <>
                  <Icon name="download" className="mr-2 h-4 w-4" />
                  Descargar documento firmado
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (consent.status === 'revoked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <Icon name="cancel" className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">
              Consentimiento revocado
            </h2>
            <p className="mt-2 text-muted-foreground">
              Este consentimiento ha sido revocado y ya no es válido.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-display text-xl">
              {consent.template?.name || 'Consentimiento Informado'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Profesional: {consent.professional?.first_name} {consent.professional?.last_name}
            </p>
          </CardHeader>
          <CardContent>
            <MultiSignatureFlow consent={consent} token={token!} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

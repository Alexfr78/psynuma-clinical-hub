import { useParams } from 'react-router-dom';
import { usePublicPatientReport } from '@/hooks/usePublicPatientReport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Icon } from '@/components/ui/icon';

export default function PatientReportView() {
  const { token } = useParams<{ token: string }>();
  const { data: report, isLoading, error } = usePublicPatientReport(token);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Cargando documento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <Icon name="error" className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">Documento no encontrado</h2>
            <p className="mt-2 text-muted-foreground">El enlace no es válido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (report.expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-amber-500/10 p-4">
              <Icon name="schedule" className="h-8 w-8 text-amber-500" />
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">Enlace caducado</h2>
            <p className="mt-2 text-muted-foreground">
              Este enlace dejó de estar disponible el{' '}
              {format(new Date(report.expiresAt), "d 'de' MMMM 'de' yyyy", { locale: es })}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Contacta con tu profesional si necesitas volver a consultarlo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader className="text-center space-y-2">
            {report.centerLogoUrl && (
              <img
                src={report.centerLogoUrl}
                alt={report.centerName || ''}
                className="mx-auto h-12 object-contain"
              />
            )}
            <CardTitle className="font-display text-xl">{report.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {report.patientFirstName ? `Para ${report.patientFirstName} · ` : ''}
              {format(new Date(report.generatedAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
              {report.centerName ? ` · ${report.centerName}` : ''}
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {report.contentMarkdown}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Este enlace es personal e intransferible. Estará disponible hasta el{' '}
              {format(new Date(report.expiresAt), "d 'de' MMMM 'de' yyyy", { locale: es })}.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

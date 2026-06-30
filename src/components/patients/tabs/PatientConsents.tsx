import { useState } from 'react';
import { Plus, FileText, Loader2, Upload, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConsents } from '@/hooks/useConsents';
import { useAuth } from '@/hooks/useAuth';
import { ConsentCard } from '@/components/consents/ConsentCard';
import { CreateConsentDialog } from '@/components/consents/CreateConsentDialog';
import { SendConsentDialog } from '@/components/consents/SendConsentDialog';
import { UploadConsentDialog } from '@/components/consents/UploadConsentDialog';
import { Patient } from '@/hooks/usePatients';
import { useActiveCancellationPolicy, useCreateCancellationPolicyConsent } from '@/hooks/useCancellationPolicy';

interface PatientConsentsProps {
  patientId: string;
  patient: Patient;
}

export function PatientConsents({ patientId, patient }: PatientConsentsProps) {
  const { consents, isLoading } = useConsents(patientId);
  const { profile } = useAuth();
  const { data: activeCancellationPolicy } = useActiveCancellationPolicy();
  const createCancellationPolicyConsent = useCreateCancellationPolicyConsent(patient);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sendDialogConsent, setSendDialogConsent] = useState<typeof consents[0] | null>(null);

  const handleConsentCreated = (consentId: string) => {
    const newConsent = consents.find((c) => c.id === consentId);
    if (newConsent) {
      setSendDialogConsent(newConsent);
    }
  };

  const handleCreateCancellationPolicyConsent = async () => {
    const consent = await createCancellationPolicyConsent.mutateAsync();
    setSendDialogConsent(consent);
  };

  const policyConsents = consents.filter((consent) => consent.cancellation_policy_version_id);
  const signedPolicyConsent = policyConsents.find((consent) => consent.status === 'signed');
  const pendingPolicyConsent = policyConsents.find((consent) => consent.status === 'pending');
  const hasActivePolicySigned = !!activeCancellationPolicy
    && signedPolicyConsent?.cancellation_policy_version_id === activeCancellationPolicy.id;
  const policyStatus = hasActivePolicySigned
    ? 'signed'
    : signedPolicyConsent
      ? 'outdated'
      : pendingPolicyConsent
        ? 'pending'
        : 'missing';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-semibold">
          Consentimientos informados
        </h2>
        <div className="flex gap-2">
          {activeCancellationPolicy && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleCreateCancellationPolicyConsent}
              disabled={createCancellationPolicyConsent.isPending}
            >
              {createCancellationPolicyConsent.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Política cancelación
            </Button>
          )}
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Subir firmado
          </Button>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo
          </Button>
        </div>
      </div>

      {activeCancellationPolicy && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                {policyStatus === 'signed' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : policyStatus === 'pending' ? (
                  <Clock className="h-5 w-5 text-amber-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Política de cancelación</h3>
                  {policyStatus === 'signed' && <Badge variant="outline">Vigente</Badge>}
                  {policyStatus === 'outdated' && <Badge variant="secondary">Versión anterior firmada</Badge>}
                  {policyStatus === 'pending' && <Badge variant="outline">Pendiente de firma</Badge>}
                  {policyStatus === 'missing' && <Badge variant="destructive">Sin firma</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  Versión activa: {activeCancellationPolicy.name} v{activeCancellationPolicy.version_number}
                </p>
                {signedPolicyConsent?.signed_at && (
                  <p className="text-xs text-muted-foreground">
                    Última firma: {new Date(signedPolicyConsent.signed_at).toLocaleDateString('es-ES')}
                  </p>
                )}
              </div>
            </div>

            {policyStatus !== 'signed' && (
              <Button
                variant={policyStatus === 'missing' ? 'default' : 'outline'}
                size="sm"
                onClick={handleCreateCancellationPolicyConsent}
                disabled={createCancellationPolicyConsent.isPending}
              >
                {createCancellationPolicyConsent.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Enviar política
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {consents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold">Sin consentimientos</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Este contacto no tiene consentimientos registrados
          </p>
          <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Crear consentimiento
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {consents.map((consent) => (
            <ConsentCard key={consent.id} consent={consent} patientPhone={patient.phone} />
          ))}
        </div>
      )}

      <CreateConsentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        patient={patient}
        onSuccess={handleConsentCreated}
      />

      {profile?.center_id && profile?.id && (
        <UploadConsentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          patientId={patientId}
          centerId={profile.center_id}
          professionalId={profile.id}
          onSuccess={() => {}}
        />
      )}

      {sendDialogConsent && (
        <SendConsentDialog
          consent={sendDialogConsent}
          patientPhone={patient.phone}
          open={!!sendDialogConsent}
          onOpenChange={(open) => !open && setSendDialogConsent(null)}
        />
      )}
    </div>
  );
}

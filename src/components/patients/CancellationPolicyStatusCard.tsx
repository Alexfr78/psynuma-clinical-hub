import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SendConsentDialog } from '@/components/consents/SendConsentDialog';
import { useConsents, type Consent } from '@/hooks/useConsents';
import { useActiveCancellationPolicy, useCreateCancellationPolicyConsent } from '@/hooks/useCancellationPolicy';
import { Patient } from '@/hooks/usePatients';

interface CancellationPolicyStatusCardProps {
  patient: Patient;
}

/**
 * Estado de la firma de la política de cancelación activa del centro para
 * este contacto, con acceso directo a enviarla si falta o está desfasada.
 */
export function CancellationPolicyStatusCard({ patient }: CancellationPolicyStatusCardProps) {
  const { consents } = useConsents(patient.id);
  const { data: activeCancellationPolicy } = useActiveCancellationPolicy();
  const createCancellationPolicyConsent = useCreateCancellationPolicyConsent(patient);
  const [sendDialogConsent, setSendDialogConsent] = useState<Consent | null>(null);

  if (!activeCancellationPolicy) return null;

  const handleCreateCancellationPolicyConsent = async () => {
    const consent = await createCancellationPolicyConsent.mutateAsync();
    setSendDialogConsent(consent as Consent);
  };

  const policyConsents = consents.filter((consent) => consent.cancellation_policy_version_id);
  const signedPolicyConsent = policyConsents.find((consent) => consent.status === 'signed');
  const pendingPolicyConsent = policyConsents.find((consent) => consent.status === 'pending');
  const hasActivePolicySigned = signedPolicyConsent?.cancellation_policy_version_id === activeCancellationPolicy.id;
  const policyStatus = hasActivePolicySigned
    ? 'signed'
    : signedPolicyConsent
      ? 'outdated'
      : pendingPolicyConsent
        ? 'pending'
        : 'missing';

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2">
              {policyStatus === 'signed' ? (
                <Icon name="check_circle" className="h-5 w-5 text-green-600" />
              ) : policyStatus === 'pending' ? (
                <Icon name="schedule" className="h-5 w-5 text-amber-600" />
              ) : (
                <Icon name="warning" className="h-5 w-5 text-destructive" />
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
                <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icon name="description" className="mr-2 h-4 w-4" />
              )}
              Enviar política
            </Button>
          )}
        </CardContent>
      </Card>

      {sendDialogConsent && (
        <SendConsentDialog
          consent={sendDialogConsent}
          patientPhone={patient.phone}
          open={!!sendDialogConsent}
          onOpenChange={(open) => !open && setSendDialogConsent(null)}
        />
      )}
    </>
  );
}

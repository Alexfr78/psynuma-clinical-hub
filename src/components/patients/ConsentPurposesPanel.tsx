import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { usePatientConsentPurposes } from '@/hooks/usePatientConsentPurposes';
import {
  ALL_CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
  consentPurposeStatusReason,
} from '@/lib/consent-block-messages';

interface ConsentPurposesPanelProps {
  patientId: string;
}

/**
 * Compact, at-a-glance view of the five purpose-scoped consent checkboxes
 * (recording, AI processing, report generation, WhatsApp, email) so the
 * professional doesn't have to open each individual consent to see what a
 * patient actually authorized. Status is never conveyed by color alone —
 * every row pairs an icon with an explicit label and, when denied, the
 * concrete reason in plain language.
 */
export function ConsentPurposesPanel({ patientId }: ConsentPurposesPanelProps) {
  const { results, isLoading, isError } = usePatientConsentPurposes(patientId);

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 font-display text-sm font-semibold">Permisos otorgados</h3>

        {isError && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <Icon name="error" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No se ha podido comprobar el estado de los permisos. Inténtalo de nuevo más tarde.</span>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {ALL_CONSENT_PURPOSES.map((purpose) => {
            const label = CONSENT_PURPOSE_LABELS[purpose];
            const result = results?.[purpose];

            // Loading: never render this as "not authorized" — that would
            // be misleadingly alarming while the check is still in flight.
            if (isLoading) {
              return (
                <li key={purpose} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="progress_activity" className="h-4 w-4 shrink-0 animate-spin" />
                  <span>{label}: comprobando…</span>
                </li>
              );
            }

            if (isError || !result) {
              return (
                <li key={purpose} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="help" className="h-4 w-4 shrink-0" />
                  <span>{label}: no se pudo comprobar</span>
                </li>
              );
            }

            if (result.granted) {
              return (
                <li key={purpose} className="flex items-start gap-2 text-sm">
                  <Icon name="check_circle" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      Autorizado
                      {result.signedAt
                        ? ` el ${format(new Date(result.signedAt), "d 'de' MMMM 'de' yyyy", { locale: es })}`
                        : ''}
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={purpose} className="flex items-start gap-2 text-sm">
                <Icon name="cancel" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    No autorizado — {consentPurposeStatusReason(result)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

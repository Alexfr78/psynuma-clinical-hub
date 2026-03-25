import { useState } from 'react';
import { Plus, FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConsents } from '@/hooks/useConsents';
import { useAuth } from '@/hooks/useAuth';
import { ConsentCard } from '@/components/consents/ConsentCard';
import { CreateConsentDialog } from '@/components/consents/CreateConsentDialog';
import { SendConsentDialog } from '@/components/consents/SendConsentDialog';
import { UploadConsentDialog } from '@/components/consents/UploadConsentDialog';
import { Patient } from '@/hooks/usePatients';

interface PatientConsentsProps {
  patientId: string;
  patient: Patient;
}

export function PatientConsents({ patientId, patient }: PatientConsentsProps) {
  const { consents, isLoading } = useConsents(patientId);
  const { profile } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sendDialogConsent, setSendDialogConsent] = useState<typeof consents[0] | null>(null);

  const handleConsentCreated = (consentId: string) => {
    const newConsent = consents.find((c) => c.id === consentId);
    if (newConsent) {
      setSendDialogConsent(newConsent);
    }
  };

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
            <ConsentCard key={consent.id} consent={consent} />
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
          open={!!sendDialogConsent}
          onOpenChange={(open) => !open && setSendDialogConsent(null)}
        />
      )}
    </div>
  );
}

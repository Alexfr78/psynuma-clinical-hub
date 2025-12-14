import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SignatureCanvas, SignatureCanvasRef } from './SignatureCanvas';
import { PublicConsent, usePublicConsent } from '@/hooks/usePublicConsent';
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

interface MultiSignatureFlowProps {
  consent: PublicConsent;
  token: string;
}

export function MultiSignatureFlow({ consent, token }: MultiSignatureFlowProps) {
  const { addSignature, markAsSigned } = usePublicConsent(token);
  const signatureRef = useRef<SignatureCanvasRef>(null);

  const [currentStep, setCurrentStep] = useState<'document' | 'guardian' | 'patient' | 'complete'>('document');
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptedGdpr, setAcceptedGdpr] = useState(false);
  const [acceptedVerifications, setAcceptedVerifications] = useState<Record<number, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const verificationCheckboxes = consent.template?.verification_checkboxes || [];
  const allVerificationsAccepted = verificationCheckboxes.length === 0 || 
    verificationCheckboxes.every((_, index) => acceptedVerifications[index]);

  const needsGuardian = consent.requires_guardian;
  const guardianSigned = consent.signatures?.some((s) => s.signer_role === 'guardian');
  const patientSigned = consent.signatures?.some((s) => s.signer_role === 'patient');

  // Determine initial step based on existing signatures
  const getInitialStep = () => {
    if (patientSigned) return 'complete';
    if (needsGuardian && !guardianSigned) return 'guardian';
    return 'patient';
  };

  // Calculate progress
  const getProgress = () => {
    if (currentStep === 'document') return 25;
    if (currentStep === 'guardian') return 50;
    if (currentStep === 'patient') return 75;
    return 100;
  };

  const handleProceedToSign = () => {
    if (needsGuardian && !guardianSigned) {
      setCurrentStep('guardian');
    } else {
      setCurrentStep('patient');
    }
  };

  const handleSign = async (role: 'guardian' | 'patient') => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) return;

    setIsSubmitting(true);
    try {
      const signatureData = signatureRef.current.getSignatureData();
      if (!signatureData) return;

      const signerName = role === 'guardian'
        ? consent.patient?.guardian_name || 'Tutor'
        : `${consent.patient?.first_name} ${consent.patient?.last_name}`;

      await addSignature.mutateAsync({
        consentId: consent.id,
        signerName,
        signerRole: role,
        signatureOrder: role === 'guardian' ? 1 : 2,
        signatureData,
      });

      // Reset for next step
      signatureRef.current.clear();
      setHasSignature(false);
      setAcceptedGdpr(false);
      setAcceptedVerifications({});

      if (role === 'guardian') {
        setCurrentStep('patient');
      } else {
        // All signatures complete, mark as signed
        await markAsSigned.mutateAsync(consent.id);
        setCurrentStep('complete');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete state
  if (currentStep === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-green-500/10 p-4">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold">
          ¡Documento firmado correctamente!
        </h2>
        <p className="mt-2 text-muted-foreground">
          El consentimiento ha sido registrado. Puedes cerrar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Lectura</span>
          {needsGuardian && <span>Firma tutor</span>}
          <span>Firma paciente</span>
          <span>Completado</span>
        </div>
        <Progress value={getProgress()} />
      </div>

      {/* Document View */}
      {currentStep === 'document' && (
        <>
          <Card className="max-h-[400px] overflow-auto p-6">
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: consent.content_snapshot }}
            />
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleProceedToSign}>
              Proceder a firmar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* Guardian Signature */}
      {currentStep === 'guardian' && (
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="font-semibold">Firma del tutor</h3>
            <p className="text-sm text-muted-foreground">
              {consent.patient?.guardian_name || 'Tutor'} ({consent.patient?.guardian_relationship || 'Responsable legal'})
            </p>
          </div>

          <SignatureCanvas ref={signatureRef} onSignatureChange={setHasSignature} />

          {/* Verification Checkboxes */}
          {verificationCheckboxes.length > 0 && (
            <div className="space-y-3">
              {verificationCheckboxes.map((checkbox, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Checkbox
                    id={`verification-guardian-${index}`}
                    checked={acceptedVerifications[index] || false}
                    onCheckedChange={(checked) => 
                      setAcceptedVerifications(prev => ({ ...prev, [index]: checked === true }))
                    }
                  />
                  <label htmlFor={`verification-guardian-${index}`} className="text-sm leading-tight">
                    {checkbox}
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-3">
            <Checkbox
              id="gdpr-guardian"
              checked={acceptedGdpr}
              onCheckedChange={(checked) => setAcceptedGdpr(checked === true)}
            />
            <label htmlFor="gdpr-guardian" className="text-sm leading-tight">
              He leído y acepto el contenido del documento. Entiendo que mis datos
              serán tratados conforme al RGPD y doy mi consentimiento expreso para
              el tratamiento descrito.
            </label>
          </div>

          <Button
            className="w-full"
            disabled={!hasSignature || !acceptedGdpr || !allVerificationsAccepted || isSubmitting}
            onClick={() => handleSign('guardian')}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando firma...
              </>
            ) : (
              'Firmar como tutor'
            )}
          </Button>
        </div>
      )}

      {/* Patient Signature */}
      {currentStep === 'patient' && (
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="font-semibold">Firma del paciente</h3>
            <p className="text-sm text-muted-foreground">
              {consent.patient?.first_name} {consent.patient?.last_name}
            </p>
          </div>

          <SignatureCanvas ref={signatureRef} onSignatureChange={setHasSignature} />

          {/* Verification Checkboxes */}
          {verificationCheckboxes.length > 0 && (
            <div className="space-y-3">
              {verificationCheckboxes.map((checkbox, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Checkbox
                    id={`verification-patient-${index}`}
                    checked={acceptedVerifications[index] || false}
                    onCheckedChange={(checked) => 
                      setAcceptedVerifications(prev => ({ ...prev, [index]: checked === true }))
                    }
                  />
                  <label htmlFor={`verification-patient-${index}`} className="text-sm leading-tight">
                    {checkbox}
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-3">
            <Checkbox
              id="gdpr-patient"
              checked={acceptedGdpr}
              onCheckedChange={(checked) => setAcceptedGdpr(checked === true)}
            />
            <label htmlFor="gdpr-patient" className="text-sm leading-tight">
              He leído y acepto el contenido del documento. Entiendo que mis datos
              serán tratados conforme al RGPD y doy mi consentimiento expreso para
              el tratamiento descrito.
            </label>
          </div>

          <Button
            className="w-full"
            disabled={!hasSignature || !acceptedGdpr || !allVerificationsAccepted || isSubmitting}
            onClick={() => handleSign('patient')}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando firma...
              </>
            ) : (
              'Firmar documento'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SignatureCanvas, SignatureCanvasRef } from './SignatureCanvas';
import { PublicConsent, usePublicConsent } from '@/hooks/usePublicConsent';
import { Loader2, CheckCircle2, ArrowRight, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MultiSignatureFlowProps {
  consent: PublicConsent;
  token: string;
}

const VERIFICATION_PLACEHOLDER = '{campos_verificacion}';
const CHECKBOX_MARKER = '<!--VERIFICATION_CHECKBOXES-->';

// Function to replace the placeholder along with its containing HTML structure
function replaceVerificationPlaceholder(html: string): string {
  // Pattern to match: <div><span...>{campos_verificacion}</span></div> or similar nested structures
  // We match the entire containing div/span block that has the placeholder
  const patterns = [
    // Match <div><span...>{campos_verificacion}</span></div>
    /<div[^>]*>\s*<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>\s*<\/div>/gi,
    // Match <span...>{campos_verificacion}</span> (without outer div)
    /<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>/gi,
    // Match <div...>{campos_verificacion}</div>
    /<div[^>]*>\s*\{campos_verificacion\}\s*<\/div>/gi,
    // Match <p...>{campos_verificacion}</p>
    /<p[^>]*>\s*\{campos_verificacion\}\s*<\/p>/gi,
    // Match just the placeholder
    /\{campos_verificacion\}/gi,
  ];
  
  let result = html;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, CHECKBOX_MARKER);
      break; // Only replace once
    }
  }
  return result;
}

// Component to render document with inline verification checkboxes
interface DocumentWithVerificationsProps {
  content: string;
  verificationCheckboxes: string[];
  acceptedVerifications: Record<number, boolean>;
  setAcceptedVerifications: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  hasPlaceholder: boolean;
  prefix: string;
}

function DocumentWithVerifications({
  content,
  verificationCheckboxes,
  acceptedVerifications,
  setAcceptedVerifications,
  hasPlaceholder,
  prefix,
}: DocumentWithVerificationsProps) {
  // Replace the placeholder (with any surrounding tags) with a clean marker
  const processedContent = replaceVerificationPlaceholder(content);
  const cleanContent = processedContent.replace(CHECKBOX_MARKER, '');
  
  // If no verification checkboxes, just render the content without the placeholder
  if (verificationCheckboxes.length === 0) {
    return (
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: cleanContent }}
      />
    );
  }

  // If placeholder exists, split by the clean marker and insert checkboxes at that position
  if (hasPlaceholder && processedContent.includes(CHECKBOX_MARKER)) {
    const parts = processedContent.split(CHECKBOX_MARKER);

    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <div dangerouslySetInnerHTML={{ __html: parts[0] }} />
        
        {/* Inline checkboxes at placeholder position */}
        <div className="my-4 space-y-3 rounded-md border bg-muted/30 p-4 not-prose">
          {verificationCheckboxes.map((checkbox, index) => (
            <div key={index} className="flex items-start gap-3">
              <Checkbox
                id={`${prefix}-verification-${index}`}
                checked={acceptedVerifications[index] || false}
                onCheckedChange={(checked) => 
                  setAcceptedVerifications(prev => ({ ...prev, [index]: checked === true }))
                }
              />
              <label 
                htmlFor={`${prefix}-verification-${index}`} 
                className="text-sm leading-tight cursor-pointer"
              >
                {checkbox}
              </label>
            </div>
          ))}
        </div>
        
        {parts[1] && <div dangerouslySetInnerHTML={{ __html: parts[1] }} />}
      </div>
    );
  }

  // No placeholder - render content then checkboxes at the end
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <div dangerouslySetInnerHTML={{ __html: cleanContent }} />
      
      {/* Checkboxes after content */}
      <div className="my-4 space-y-3 rounded-md border bg-muted/30 p-4 not-prose">
        {verificationCheckboxes.map((checkbox, index) => (
          <div key={index} className="flex items-start gap-3">
            <Checkbox
              id={`${prefix}-verification-${index}`}
              checked={acceptedVerifications[index] || false}
              onCheckedChange={(checked) => 
                setAcceptedVerifications(prev => ({ ...prev, [index]: checked === true }))
              }
            />
            <label 
              htmlFor={`${prefix}-verification-${index}`} 
              className="text-sm leading-tight cursor-pointer"
            >
              {checkbox}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MultiSignatureFlow({ consent, token }: MultiSignatureFlowProps) {
  const { addSignature, markAsSigned } = usePublicConsent(token);
  const signatureRef = useRef<SignatureCanvasRef>(null);

  const [currentStep, setCurrentStep] = useState<'document' | 'guardian' | 'patient' | 'complete'>('document');
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptedGdpr, setAcceptedGdpr] = useState(false);
  const [acceptedVerifications, setAcceptedVerifications] = useState<Record<number, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const verificationCheckboxes = consent.template?.verification_checkboxes || [];
  const allVerificationsAccepted = verificationCheckboxes.length === 0 || 
    verificationCheckboxes.every((_, index) => acceptedVerifications[index]);

  // Check if placeholder exists in content
  const hasPlaceholderInContent = consent.content_snapshot.includes(VERIFICATION_PLACEHOLDER);

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

  // Generate PDF when complete
  useEffect(() => {
    if (currentStep === 'complete' && !pdfUrl && !isGeneratingPdf) {
      setIsGeneratingPdf(true);
      supabase.functions.invoke('generate-consent-pdf', {
        body: { consent_id: consent.id },
      }).then(({ data, error }) => {
        if (data?.url) {
          setPdfUrl(data.url);
        }
        if (error) {
          console.error('Error generating PDF:', error);
        }
        setIsGeneratingPdf(false);
      });
    }
  }, [currentStep, consent.id, pdfUrl, isGeneratingPdf]);

  const handleDownloadPdf = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
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
          El consentimiento ha sido registrado. Puedes descargar el documento firmado.
        </p>
        <Button 
          className="mt-6" 
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf || !pdfUrl}
        >
          {isGeneratingPdf ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando documento...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Descargar documento firmado
            </>
          )}
        </Button>
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
            <DocumentWithVerifications 
              content={consent.content_snapshot}
              verificationCheckboxes={verificationCheckboxes}
              acceptedVerifications={acceptedVerifications}
              setAcceptedVerifications={setAcceptedVerifications}
              hasPlaceholder={hasPlaceholderInContent}
              prefix="document"
            />
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleProceedToSign} disabled={!allVerificationsAccepted && hasPlaceholderInContent}>
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

          {/* Verification Checkboxes - only show here if NOT in document */}
          {!hasPlaceholderInContent && verificationCheckboxes.length > 0 && (
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

          {/* Verification Checkboxes - only show here if NOT in document */}
          {!hasPlaceholderInContent && verificationCheckboxes.length > 0 && (
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

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SignatureCanvas, SignatureCanvasRef } from './SignatureCanvas';
import { PublicConsent, usePublicConsent } from '@/hooks/usePublicConsent';
import { Loader2, CheckCircle2, ArrowRight, Download, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeHtml } from '@/lib/sanitize';

interface MultiSignatureFlowProps {
  consent: PublicConsent;
  token: string;
}

const VERIFICATION_PLACEHOLDER = '{campos_verificacion}';
const CHECKBOX_MARKER = '<!--VERIFICATION_CHECKBOXES-->';

// Function to replace the placeholder along with its containing HTML structure
function replaceVerificationPlaceholder(html: string): string {
  const patterns = [
    /<div[^>]*>\s*<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>\s*<\/div>/i,
    /<span[^>]*>\s*\{campos_verificacion\}\s*<\/span>/i,
    /<div[^>]*>\s*\{campos_verificacion\}\s*<\/div>/i,
    /<p[^>]*>\s*\{campos_verificacion\}\s*<\/p>/i,
    /\{campos_verificacion\}/i,
  ];
  
  let result = html;
  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, CHECKBOX_MARKER);
      break;
    }
  }
  return result;
}

// Type for verification responses: 'authorized' | 'not_authorized' | undefined
type VerificationResponse = 'authorized' | 'not_authorized' | undefined;

// Component to render document with inline verification checkboxes
interface DocumentWithVerificationsProps {
  content: string;
  verificationCheckboxes: string[];
  verificationResponses: Record<number, VerificationResponse>;
  setVerificationResponses: React.Dispatch<React.SetStateAction<Record<number, VerificationResponse>>>;
  hasPlaceholder: boolean;
  prefix: string;
  readOnly?: boolean;
}

function DocumentWithVerifications({
  content,
  verificationCheckboxes,
  verificationResponses,
  setVerificationResponses,
  hasPlaceholder,
  prefix,
  readOnly = false,
}: DocumentWithVerificationsProps) {
  const processedContent = replaceVerificationPlaceholder(content);
  const cleanContent = processedContent.replace(CHECKBOX_MARKER, '');
  
  // If no verification checkboxes, just render the content
  if (verificationCheckboxes.length === 0) {
    return (
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanContent) }}
      />
    );
  }

  const VerificationFields = (
    <div className="my-4 space-y-4 rounded-lg border-2 border-primary/30 bg-muted/30 p-4 not-prose">
      {verificationCheckboxes.map((checkbox, index) => (
        <div key={index} className="space-y-2">
          <p className="text-sm font-medium">{checkbox}</p>
          <RadioGroup
            value={verificationResponses[index] || ''}
            onValueChange={(value) => {
              if (!readOnly) {
                setVerificationResponses(prev => ({
                  ...prev,
                  [index]: value as VerificationResponse
                }));
              }
            }}
            disabled={readOnly}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="authorized" id={`${prefix}-auth-${index}`} />
              <Label 
                htmlFor={`${prefix}-auth-${index}`} 
                className="text-sm font-medium text-green-700 dark:text-green-400 cursor-pointer"
              >
                ✓ Autorizo
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="not_authorized" id={`${prefix}-notauth-${index}`} />
              <Label 
                htmlFor={`${prefix}-notauth-${index}`} 
                className="text-sm font-medium text-red-700 dark:text-red-400 cursor-pointer"
              >
                ✗ No autorizo
              </Label>
            </div>
          </RadioGroup>
        </div>
      ))}
    </div>
  );

  // If placeholder exists, insert at that position
  if (hasPlaceholder && processedContent.includes(CHECKBOX_MARKER)) {
    const parts = processedContent.split(CHECKBOX_MARKER);
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(parts[0]) }} />
        {VerificationFields}
        {parts[1] && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(parts[1]) }} />}
      </div>
    );
  }

  // No placeholder - render content then verification fields
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanContent) }} />
      {VerificationFields}
    </div>
  );
}

export function MultiSignatureFlow({ consent, token }: MultiSignatureFlowProps) {
  const { addSignature, markAsSigned, saveVerificationResponses } = usePublicConsent(token);
  const signatureRef = useRef<SignatureCanvasRef>(null);

  const [currentStep, setCurrentStep] = useState<'document' | 'guardian' | 'patient' | 'complete'>('document');
  const [hasSignature, setHasSignature] = useState(false);
  const [acceptedGdpr, setAcceptedGdpr] = useState(false);
  const [verificationResponses, setVerificationResponses] = useState<Record<number, VerificationResponse>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const verificationCheckboxes = consent.template?.verification_checkboxes || [];
  
  // Check if all verification fields are answered (not just true, but answered)
  const allVerificationsAnswered = verificationCheckboxes.length === 0 || 
    verificationCheckboxes.every((_, index) => verificationResponses[index] !== undefined);

  // Check if placeholder exists in content
  const hasPlaceholderInContent = consent.content_snapshot.includes(VERIFICATION_PLACEHOLDER);

  const needsGuardian = consent.requires_guardian;
  const guardianSigned = consent.signatures?.some((s) => s.signer_role === 'guardian');
  const patientSigned = consent.signatures?.some((s) => s.signer_role === 'patient');

  // Calculate progress
  const getProgress = () => {
    if (currentStep === 'document') return 25;
    if (currentStep === 'guardian') return 50;
    if (currentStep === 'patient') return 75;
    return 100;
  };

  const handleProceedToSign = async () => {
    // First save the verification responses
    if (verificationCheckboxes.length > 0) {
      setIsSubmitting(true);
      try {
        // Convert to boolean format for storage
        const responsesToSave: Record<string, boolean> = {};
        Object.entries(verificationResponses).forEach(([key, value]) => {
          responsesToSave[key] = value === 'authorized';
        });
        
        await saveVerificationResponses.mutateAsync({
          consentId: consent.id,
          responses: responsesToSave,
        });
      } catch (error) {
        console.error('Error saving verification responses:', error);
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    }
    
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

      // Build signer name with proper fallbacks to avoid "undefined undefined"
      let signerName: string;
      if (role === 'guardian') {
        signerName = consent.patient?.guardian_name?.trim() || 'Tutor/Responsable legal';
      } else {
        const firstName = consent.patient?.first_name?.trim() || '';
        const lastName = consent.patient?.last_name?.trim() || '';
        signerName = [firstName, lastName].filter(Boolean).join(' ') || 'Paciente';
      }

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
              verificationResponses={verificationResponses}
              setVerificationResponses={setVerificationResponses}
              hasPlaceholder={hasPlaceholderInContent}
              prefix="document"
            />
          </Card>
          
          {/* Warning if not all answered */}
          {verificationCheckboxes.length > 0 && !allVerificationsAnswered && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Debes indicar si autorizas o no cada uno de los campos de autorización antes de continuar.</span>
            </div>
          )}
          
          <div className="flex justify-end">
            <Button 
              onClick={handleProceedToSign}
              disabled={!allVerificationsAnswered || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  Proceder a firmar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
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
            disabled={!hasSignature || !acceptedGdpr || isSubmitting}
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
            disabled={!hasSignature || !acceptedGdpr || isSubmitting}
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

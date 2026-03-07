import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Shield, ShieldCheck, ShieldOff, Loader2, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

type MfaStatus = 'loading' | 'disabled' | 'enrolling' | 'verifying' | 'enabled';

export function SecuritySection() {
  const { toast } = useToast();
  const { revokeTrustedDevices } = useAuth();
  const [status, setStatus] = useState<MfaStatus>('loading');
  const [qrUri, setQrUri] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    setStatus('loading');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setStatus('disabled');
      return;
    }
    const verifiedFactor = data?.totp?.find(f => f.status === 'verified');
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id);
      setStatus('enabled');
    } else {
      setStatus('disabled');
    }
  };

  const handleEnroll = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Psycma TOTP',
      });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setFactorId(data.id);
      setStatus('enrolling');
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudo iniciar la configuración 2FA',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (verifyCode.length !== 6) return;
    setIsProcessing(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setStatus('enabled');
      setVerifyCode('');
      toast({
        title: 'Doble factor activado',
        description: 'Tu cuenta ahora está protegida con autenticación de doble factor.',
      });
    } catch (err: any) {
      toast({
        title: 'Código incorrecto',
        description: 'El código introducido no es válido. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnenroll = async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setStatus('disabled');
      setFactorId('');
      toast({
        title: '2FA desactivado',
        description: 'La autenticación de doble factor ha sido desactivada.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudo desactivar el 2FA',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Seguridad de la cuenta
        </CardTitle>
        <CardDescription>
          Protege tu cuenta con autenticación de doble factor (2FA)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === 'enabled' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
              <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">2FA activado</p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Tu cuenta está protegida con autenticación de doble factor.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleUnenroll}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldOff className="mr-2 h-4 w-4" />
                )}
                Desactivar 2FA
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  revokeTrustedDevices();
                  toast({
                    title: 'Dispositivos revocados',
                    description: 'Todos los dispositivos de confianza han sido eliminados. Se pedirá 2FA en el próximo inicio de sesión.',
                  });
                }}
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Revocar dispositivos de confianza
              </Button>
            </div>
          </div>
        )}

        {status === 'disabled' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <Shield className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">2FA no activado</p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Añade una capa extra de seguridad a tu cuenta usando una app autenticadora como Google Authenticator o Authy.
                </p>
              </div>
            </div>
            <Button onClick={handleEnroll} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="mr-2 h-4 w-4" />
              )}
              Activar autenticación de doble factor
            </Button>
          </div>
        )}

        {status === 'enrolling' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="font-medium">1. Escanea el código QR</h4>
              <p className="text-sm text-muted-foreground">
                Abre tu app autenticadora (Google Authenticator, Authy, etc.) y escanea este código QR.
              </p>
              <div className="flex justify-center rounded-lg border bg-white p-6">
                <QRCodeSVG value={qrUri} size={200} />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">2. Introduce el código de verificación</h4>
              <p className="text-sm text-muted-foreground">
                Introduce el código de 6 dígitos que muestra tu app autenticadora.
              </p>
              <div className="flex justify-center py-2">
                <InputOTP
                  maxLength={6}
                  value={verifyCode}
                  onChange={setVerifyCode}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStatus('disabled');
                  setVerifyCode('');
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleVerifyEnrollment}
                disabled={verifyCode.length !== 6 || isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Verificar y activar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

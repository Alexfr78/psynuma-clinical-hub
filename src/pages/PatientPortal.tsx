import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { usePatientPortal } from '@/hooks/usePatientPortal';
import { Icon } from '@/components/ui/icon';

type AccessMethod = 'whatsapp' | 'email';
type AccessStep = 'identify' | 'verify';

export default function PatientPortal() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { requestAccessCode, verifyAccessCode } = usePatientPortal(slug);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [centerData, setCenterData] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [method, setMethod] = useState<AccessMethod>('whatsapp');
  const [step, setStep] = useState<AccessStep>('identify');
  const [identifier, setIdentifier] = useState('');
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const fetchCenterData = async () => {
      if (!slug) {
        setPageError('Centro no especificado');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .rpc('get_portal_center', { p_slug: slug })
          .maybeSingle();

        if (error || !data) {
          setPageError('Centro no encontrado');
          return;
        }

        setCenterData({ name: data.name, logo_url: data.logo_url });
      } catch (error) {
        console.error('Error fetching center:', error);
        setPageError('Error al cargar el centro');
      } finally {
        setLoading(false);
      }
    };

    fetchCenterData();
  }, [slug]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'verify') codeInputRef.current?.focus();
  }, [step]);

  const validateIdentifier = () => {
    if (method === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())
        ? null
        : 'Introduce un correo electrónico válido.';
    }
    return identifier.replace(/\D/g, '').length >= 9
      ? null
      : 'Introduce un número de teléfono válido.';
  };

  const sendCode = async () => {
    const validationError = validateIdentifier();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const result = await requestAccessCode(identifier.trim(), method);
    setSubmitting(false);

    if (!result.success || !result.requestId) {
      setFormError(result.error || 'No se ha podido enviar el código. Inténtalo de nuevo.');
      return;
    }

    setRequestId(result.requestId);
    setCode('');
    setCooldown(result.resendAfterSeconds ?? 60);
    setStep('verify');
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendCode();
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFormError('Introduce los seis dígitos del código.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const result = await verifyAccessCode(requestId, code);
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error || 'Código incorrecto o caducado.');
      codeInputRef.current?.focus();
      return;
    }

    navigate(`/portal/${slug}/dashboard`, { replace: true });
  };

  const changeMethod = (nextMethod: AccessMethod) => {
    setMethod(nextMethod);
    setStep('identify');
    setIdentifier('');
    setRequestId('');
    setCode('');
    setCooldown(0);
    setFormError(null);
  };

  const goBack = () => {
    setStep('identify');
    setRequestId('');
    setCode('');
    setCooldown(0);
    setFormError(null);
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" aria-label="Cargando portal" />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">No se puede abrir el portal</CardTitle>
            <CardDescription>{pageError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-4 text-center">
          {centerData?.logo_url && (
            <img
              src={centerData.logo_url}
              alt={`Logotipo de ${centerData.name}`}
              className="h-16 w-auto mx-auto object-contain"
            />
          )}
          <div className="space-y-1">
            <CardTitle className="text-2xl">{centerData?.name}</CardTitle>
            <CardDescription>Portal de Contactos</CardDescription>
          </div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {step === 'identify' ? (
              method === 'whatsapp' ? <Icon name="smartphone" className="h-6 w-6" /> : <Icon name="mail" className="h-6 w-6" />
            ) : (
              <Icon name="verified_user" className="h-6 w-6" />
            )}
          </div>
        </CardHeader>

        <CardContent>
          {step === 'identify' ? (
            <form onSubmit={handleRequest} className="space-y-5" noValidate>
              <div className="space-y-2 text-center">
                <h1 className="text-lg font-semibold">Accede sin contraseña</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {method === 'whatsapp'
                    ? 'Introduce el teléfono que tienes registrado. Te enviaremos un código de seis dígitos por WhatsApp.'
                    : 'Introduce el correo que tienes registrado. Te enviaremos un código de seis dígitos.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="portal-identifier">
                  {method === 'whatsapp' ? 'Teléfono móvil' : 'Correo electrónico'}
                </Label>
                <Input
                  id="portal-identifier"
                  type={method === 'whatsapp' ? 'tel' : 'email'}
                  inputMode={method === 'whatsapp' ? 'tel' : 'email'}
                  autoComplete={method === 'whatsapp' ? 'tel' : 'email'}
                  placeholder={method === 'whatsapp' ? '612 345 678' : 'tu@email.com'}
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    if (formError) setFormError(null);
                  }}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'portal-form-error' : 'portal-privacy-note'}
                  className="h-12 text-base"
                  autoFocus
                />
                <p id="portal-privacy-note" className="text-xs leading-5 text-muted-foreground">
                  Por privacidad, solo enviaremos el código si coincide con los datos facilitados a tu profesional.
                </p>
                {formError && (
                  <p id="portal-form-error" role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>

              <Button type="submit" className="h-12 w-full" disabled={submitting}>
                {submitting ? (
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                ) : method === 'whatsapp' ? (
                  <Icon name="chat" className="mr-2 h-4 w-4" />
                ) : (
                  <Icon name="mail" className="mr-2 h-4 w-4" />
                )}
                Enviar código
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-muted-foreground"
                onClick={() => changeMethod(method === 'whatsapp' ? 'email' : 'whatsapp')}
              >
                {method === 'whatsapp' ? <Icon name="mail" className="mr-2 h-4 w-4" /> : <Icon name="chat" className="mr-2 h-4 w-4" />}
                {method === 'whatsapp' ? 'Prefiero recibirlo por correo' : 'Recibirlo por WhatsApp'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5" noValidate>
              <div className="space-y-2 text-center">
                <h1 className="text-lg font-semibold">Introduce el código</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {method === 'whatsapp'
                    ? 'Si tus datos coinciden, recibirás el código por WhatsApp. Si el envío falla, lo enviaremos al correo registrado.'
                    : 'Si tus datos coinciden, recibirás el código en el correo registrado.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="portal-code">Código de seis dígitos</Label>
                <Input
                  ref={codeInputRef}
                  id="portal-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                    if (formError) setFormError(null);
                  }}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'portal-code-error' : 'portal-code-help'}
                  className="h-14 text-center text-2xl font-semibold tracking-[0.35em] tabular-nums"
                />
                <p id="portal-code-help" className="text-xs text-muted-foreground">
                  El código caduca en 5 minutos y solo se puede utilizar una vez.
                </p>
                {formError && (
                  <p id="portal-code-error" role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>

              <Button type="submit" className="h-12 w-full" disabled={submitting || code.length !== 6}>
                {submitting ? <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" /> : <Icon name="verified_user" className="mr-2 h-4 w-4" />}
                Acceder al portal
              </Button>

              <div className="space-y-1 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full"
                  disabled={submitting || cooldown > 0}
                  onClick={sendCode}
                >
                  <Icon name="refresh" className="mr-2 h-4 w-4" />
                  {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
                </Button>
                {method === 'whatsapp' && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-full text-muted-foreground"
                    onClick={() => changeMethod('email')}
                  >
                    <Icon name="mail" className="mr-2 h-4 w-4" />
                    No me llega: usar correo
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full text-muted-foreground"
                  onClick={goBack}
                >
                  <Icon name="arrow_back" className="mr-2 h-4 w-4" />
                  Cambiar {method === 'whatsapp' ? 'teléfono' : 'correo'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

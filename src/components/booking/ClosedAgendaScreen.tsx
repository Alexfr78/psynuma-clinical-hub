import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Clock, Users, ArrowRight, X, UserPlus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface ClosedAgendaScreenProps {
  centerName: string;
  centerLogo?: string | null;
  portalSlug: string;
  onSubmitIntake: (data: IntakeRequestData) => Promise<boolean>;
  loading?: boolean;
}

interface IntakeRequestData {
  requestType: 'waitlist' | 'referral';
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  modality?: 'online' | 'presencial';
  city?: string;
  notes?: string;
}

type ScreenStep = 'options' | 'waitlist-form' | 'referral-form' | 'success';

export function ClosedAgendaScreen({
  centerName,
  centerLogo,
  portalSlug,
  onSubmitIntake,
  loading = false,
}: ClosedAgendaScreenProps) {
  const [step, setStep] = useState<ScreenStep>('options');
  const [formData, setFormData] = useState<IntakeRequestData>({
    requestType: 'waitlist',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    modality: undefined,
    city: '',
    notes: '',
  });

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    if (formData.requestType === 'referral' && !formData.modality) {
      toast.error('Por favor selecciona una modalidad');
      return;
    }

    if (formData.requestType === 'referral' && formData.modality === 'presencial' && !formData.city) {
      toast.error('Por favor indica tu ciudad para sesiones presenciales');
      return;
    }

    const success = await onSubmitIntake(formData);
    if (success) {
      setStep('success');
    }
  };

  const goToPortal = () => {
    window.location.href = `/portal/${portalSlug}`;
  };

  const exitBooking = () => {
    window.history.back();
  };

  if (step === 'success') {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-success" />
          </div>
          <CardTitle>¡Solicitud enviada!</CardTitle>
          <CardDescription>
            {formData.requestType === 'waitlist'
              ? 'Te hemos añadido a nuestra lista de espera. Nos pondremos en contacto contigo cuando haya disponibilidad.'
              : 'Hemos recibido tu solicitud de derivación. Un profesional se pondrá en contacto contigo pronto.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Recibirás un email de confirmación en {formData.email}
          </p>
          <Button onClick={exitBooking} variant="outline" className="w-full">
            Volver
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'options') {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          {centerLogo && (
            <img src={centerLogo} alt={centerName} className="h-12 mx-auto mb-4" />
          )}
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-warning/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-warning" />
          </div>
          <CardTitle>Agenda cerrada</CardTitle>
          <CardDescription>
            Actualmente no estamos aceptando nuevas consultas, pero tienes varias opciones:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={goToPortal}
            variant="default"
            className="w-full justify-between h-auto py-4"
          >
            <div className="text-left">
              <div className="font-medium">Ya soy paciente</div>
              <div className="text-xs opacity-80">Acceder al portal de pacientes</div>
            </div>
            <ExternalLink className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => setStep('waitlist-form')}
            variant="outline"
            className="w-full justify-between h-auto py-4"
          >
            <div className="text-left">
              <div className="font-medium">Lista de espera</div>
              <div className="text-xs text-muted-foreground">Me avisáis cuando haya hueco</div>
            </div>
            <Clock className="h-5 w-5" />
          </Button>

          <Button
            onClick={() => setStep('referral-form')}
            variant="outline"
            className="w-full justify-between h-auto py-4"
          >
            <div className="text-left">
              <div className="font-medium">Derivación a otro profesional</div>
              <div className="text-xs text-muted-foreground">Que me recomienden un colega</div>
            </div>
            <Users className="h-5 w-5" />
          </Button>

          <Button
            onClick={exitBooking}
            variant="ghost"
            className="w-full justify-between h-auto py-4 text-muted-foreground"
          >
            <div className="text-left">
              <div className="font-medium">Abandonar</div>
              <div className="text-xs">Volver atrás</div>
            </div>
            <X className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Waitlist or Referral form
  const isReferral = step === 'referral-form';

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isReferral ? <Users className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          {isReferral ? 'Solicitar derivación' : 'Lista de espera'}
        </CardTitle>
        <CardDescription>
          {isReferral
            ? 'Completa tus datos y te recomendaremos un profesional que pueda atenderte.'
            : 'Déjanos tus datos y te avisaremos cuando haya disponibilidad.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nombre *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="Tu nombre"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Apellidos *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Tus apellidos"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="tu@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+34 600 000 000"
          />
        </div>

        {isReferral && (
          <>
            <div className="space-y-3">
              <Label>Modalidad preferida *</Label>
              <RadioGroup
                value={formData.modality}
                onValueChange={(v) => setFormData({ ...formData, modality: v as 'online' | 'presencial' })}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="online" id="online" />
                  <Label htmlFor="online" className="cursor-pointer">Online</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="presencial" id="presencial" />
                  <Label htmlFor="presencial" className="cursor-pointer">Presencial</Label>
                </div>
              </RadioGroup>
            </div>

            {formData.modality === 'presencial' && (
              <div className="space-y-2">
                <Label htmlFor="city">Ciudad *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Tu ciudad"
                />
              </div>
            )}
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="notes">Notas adicionales</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Cualquier información adicional que quieras compartir..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => setStep('options')}
            className="flex-1"
          >
            Volver
          </Button>
          <Button
            onClick={() => {
              setFormData({ ...formData, requestType: isReferral ? 'referral' : 'waitlist' });
              handleSubmit();
            }}
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Enviar solicitud
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

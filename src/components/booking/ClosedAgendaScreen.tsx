import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, Users, ArrowRight, ArrowLeft, X, UserPlus, ExternalLink, Globe, MapPin, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReferralFilters, ReferralPartner } from '@/hooks/usePublicBooking';

const PRIVACY_POLICY_URL = 'https://psicologosexual.com/politica-de-privacidad/';

interface ClosedAgendaScreenProps {
  centerName: string;
  centerLogo?: string | null;
  portalSlug: string;
  onSubmitIntake: (data: IntakeRequestData) => Promise<boolean>;
  onLoadFilters?: () => Promise<ReferralFilters>;
  onGetRecommendations?: (modality: string, specialty: string, province?: string, city?: string) => Promise<ReferralPartner[]>;
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
  privacyAccepted: boolean;
  privacyPolicyUrl: string;
  specialty?: string;
  referralContext?: Record<string, any>;
  selectedPartnerId?: string;
  recommendedPartnerIds?: string[];
}

type ScreenStep = 'options' | 'waitlist-form' | 'referral-wizard' | 'success';
type ReferralWizardStep = 'modality' | 'location' | 'specialty' | 'recommendations' | 'contact';

export function ClosedAgendaScreen({
  centerName,
  centerLogo,
  portalSlug,
  onSubmitIntake,
  onLoadFilters,
  onGetRecommendations,
  loading = false,
}: ClosedAgendaScreenProps) {
  const [step, setStep] = useState<ScreenStep>('options');
  const [referralStep, setReferralStep] = useState<ReferralWizardStep>('modality');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  
  // Referral wizard state
  const [filters, setFilters] = useState<ReferralFilters>({ specialties: [], provinces: [], cities: [] });
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<ReferralPartner[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  
  // Wizard selections
  const [selectedModality, setSelectedModality] = useState<'online' | 'presencial' | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');

  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  });

  // Load filters when entering referral wizard
  useEffect(() => {
    if (step === 'referral-wizard' && onLoadFilters && filters.specialties.length === 0) {
      setFiltersLoading(true);
      onLoadFilters()
        .then(setFilters)
        .finally(() => setFiltersLoading(false));
    }
  }, [step, onLoadFilters, filters.specialties.length]);

  // Load recommendations when reaching that step
  useEffect(() => {
    if (referralStep === 'recommendations' && onGetRecommendations && selectedModality && selectedSpecialty) {
      setRecommendationsLoading(true);
      onGetRecommendations(
        selectedModality,
        selectedSpecialty,
        selectedProvince || undefined,
        selectedCity || undefined
      )
        .then(setRecommendations)
        .finally(() => setRecommendationsLoading(false));
    }
  }, [referralStep, onGetRecommendations, selectedModality, selectedSpecialty, selectedProvince, selectedCity]);

  const resetReferralWizard = () => {
    setReferralStep('modality');
    setSelectedModality(null);
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedSpecialty('');
    setRecommendations([]);
    setSelectedPartnerId(null);
    setPrivacyAccepted(false);
  };

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    if (!privacyAccepted) {
      toast.error('Debes aceptar la política de privacidad');
      return;
    }

    const isReferral = step === 'referral-wizard';
    
    const submitData: IntakeRequestData = {
      requestType: isReferral ? 'referral' : 'waitlist',
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || undefined,
      notes: formData.notes || undefined,
      privacyAccepted: true,
      privacyPolicyUrl: PRIVACY_POLICY_URL,
    };

    if (isReferral) {
      submitData.modality = selectedModality || undefined;
      submitData.specialty = selectedSpecialty || undefined;
      submitData.referralContext = {
        modality: selectedModality,
        province: selectedProvince || null,
        city: selectedCity || null,
      };
      submitData.selectedPartnerId = selectedPartnerId || undefined;
      submitData.recommendedPartnerIds = recommendations.map(p => p.id);
    }

    const success = await onSubmitIntake(submitData);
    if (success) {
      setStep('success');
      setPrivacyAccepted(false);
    }
  };

  const goToPortal = () => {
    window.location.href = `/portal/${portalSlug}`;
  };

  const exitBooking = () => {
    window.history.back();
  };

  // ===== SUCCESS SCREEN =====
  if (step === 'success') {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-success" />
          </div>
          <CardTitle>¡Solicitud enviada!</CardTitle>
          <CardDescription>
            Hemos recibido tu solicitud. Un profesional se pondrá en contacto contigo pronto.
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

  // ===== OPTIONS SCREEN =====
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
            onClick={() => {
              resetReferralWizard();
              setStep('referral-wizard');
            }}
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

  // ===== WAITLIST FORM =====
  if (step === 'waitlist-form') {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Lista de espera
          </CardTitle>
          <CardDescription>
            Déjanos tus datos y te avisaremos cuando haya disponibilidad.
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

          <div className="space-y-2">
            <Label htmlFor="notes">Notas adicionales</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Cualquier información adicional..."
              rows={3}
            />
          </div>

          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="privacy-waitlist"
              checked={privacyAccepted}
              onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
            />
            <Label htmlFor="privacy-waitlist" className="text-sm leading-tight cursor-pointer">
              He leído y acepto la{' '}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
                onClick={(e) => e.stopPropagation()}
              >
                Política de Privacidad
              </a>
            </Label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setStep('options');
                setPrivacyAccepted(false);
              }}
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <Button
              onClick={handleSubmit}
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

  // ===== REFERRAL WIZARD =====
  if (step === 'referral-wizard') {
    const stepNumber = ['modality', 'location', 'specialty', 'recommendations', 'contact'].indexOf(referralStep) + 1;
    const totalSteps = selectedModality === 'presencial' ? 5 : 4;
    const adjustedStep = selectedModality === 'online' && referralStep === 'specialty' ? 2 : 
                         selectedModality === 'online' && referralStep === 'recommendations' ? 3 :
                         selectedModality === 'online' && referralStep === 'contact' ? 4 : stepNumber;

    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Encontrar profesional
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              Paso {adjustedStep} de {totalSteps}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${(adjustedStep / totalSteps) * 100}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filtersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* STEP 1: Modality */}
              {referralStep === 'modality' && (
                <>
                  <CardDescription className="text-center pb-2">
                    ¿Cómo prefieres realizar las sesiones?
                  </CardDescription>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      variant={selectedModality === 'online' ? 'default' : 'outline'}
                      className="h-24 flex-col gap-2"
                      onClick={() => setSelectedModality('online')}
                    >
                      <Globe className="h-8 w-8" />
                      <span>Online</span>
                    </Button>
                    <Button
                      variant={selectedModality === 'presencial' ? 'default' : 'outline'}
                      className="h-24 flex-col gap-2"
                      onClick={() => setSelectedModality('presencial')}
                    >
                      <MapPin className="h-8 w-8" />
                      <span>Presencial</span>
                    </Button>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep('options')}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedModality) {
                          toast.error('Selecciona una modalidad');
                          return;
                        }
                        setReferralStep(selectedModality === 'presencial' ? 'location' : 'specialty');
                      }}
                      disabled={!selectedModality}
                      className="flex-1"
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}

              {/* STEP 2: Location (only for presencial) */}
              {referralStep === 'location' && (
                <>
                  <CardDescription className="text-center pb-2">
                    ¿En qué zona buscas profesional?
                  </CardDescription>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Provincia</Label>
                      <Select value={selectedProvince} onValueChange={setSelectedProvince}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona provincia..." />
                        </SelectTrigger>
                        <SelectContent>
                          {filters.provinces.map((prov) => (
                            <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {filters.cities.length > 0 && (
                      <div className="space-y-2">
                        <Label>Ciudad (opcional)</Label>
                        <Select value={selectedCity} onValueChange={setSelectedCity}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona ciudad..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Cualquier ciudad</SelectItem>
                            {filters.cities.map((city) => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setReferralStep('modality')}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedProvince && !selectedCity) {
                          toast.error('Selecciona al menos una provincia');
                          return;
                        }
                        setReferralStep('specialty');
                      }}
                      disabled={!selectedProvince && !selectedCity}
                      className="flex-1"
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}

              {/* STEP 3: Specialty */}
              {referralStep === 'specialty' && (
                <>
                  <CardDescription className="text-center pb-2">
                    ¿Qué tipo de ayuda necesitas?
                  </CardDescription>
                  <div className="space-y-2">
                    <Label>Especialidad</Label>
                    <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona especialidad..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filters.specialties.map((spec) => (
                          <SelectItem key={spec.id} value={spec.name}>{spec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setReferralStep(selectedModality === 'presencial' ? 'location' : 'modality')}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedSpecialty) {
                          toast.error('Selecciona una especialidad');
                          return;
                        }
                        setReferralStep('recommendations');
                      }}
                      disabled={!selectedSpecialty}
                      className="flex-1"
                    >
                      Buscar profesionales
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}

              {/* STEP 4: Recommendations */}
              {referralStep === 'recommendations' && (
                <>
                  {recommendationsLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Buscando profesionales...</span>
                    </div>
                  ) : recommendations.length > 0 ? (
                    <>
                      <CardDescription className="text-center pb-2">
                        He encontrado estos profesionales de confianza:
                      </CardDescription>
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {recommendations.map((partner) => (
                          <div 
                            key={partner.id}
                            className={`border rounded-lg p-4 transition-all cursor-pointer ${
                              selectedPartnerId === partner.id 
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                                : 'hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedPartnerId(
                              selectedPartnerId === partner.id ? null : partner.id
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium flex items-center gap-2">
                                  {partner.publicName}
                                  {selectedPartnerId === partner.id && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                                {partner.description && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {partner.description}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {partner.modalities?.map((m) => (
                                    <span key={m} className="text-xs bg-muted px-2 py-0.5 rounded">
                                      {m === 'online' ? 'Online' : 'Presencial'}
                                    </span>
                                  ))}
                                  {partner.cities?.slice(0, 2).map((c) => (
                                    <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {partner.website && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(partner.website!, '_blank');
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {selectedPartnerId 
                          ? 'Profesional seleccionado. Continúa para dejarnos tus datos.'
                          : 'Puedes seleccionar uno o continuar sin elegir.'}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <AlertCircle className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">No encontramos profesionales</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Ahora mismo no tengo un profesional de confianza para ese criterio. 
                          Envíanos la solicitud y te responderemos igualmente.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setReferralStep('specialty')}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver
                    </Button>
                    <Button
                      onClick={() => setReferralStep('contact')}
                      className="flex-1"
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}

              {/* STEP 5: Contact info */}
              {referralStep === 'contact' && (
                <>
                  <CardDescription className="text-center pb-2">
                    Déjanos tus datos de contacto
                  </CardDescription>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ref-firstName">Nombre *</Label>
                      <Input
                        id="ref-firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder="Tu nombre"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ref-lastName">Apellidos *</Label>
                      <Input
                        id="ref-lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        placeholder="Tus apellidos"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-email">Email *</Label>
                    <Input
                      id="ref-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="tu@email.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-phone">Teléfono</Label>
                    <Input
                      id="ref-phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+34 600 000 000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ref-notes">Notas adicionales</Label>
                    <Textarea
                      id="ref-notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Cuéntanos un poco más sobre lo que buscas..."
                      rows={2}
                    />
                  </div>

                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox
                      id="privacy-referral"
                      checked={privacyAccepted}
                      onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
                    />
                    <Label htmlFor="privacy-referral" className="text-sm leading-tight cursor-pointer">
                      He leído y acepto la{' '}
                      <a
                        href={PRIVACY_POLICY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Política de Privacidad
                      </a>
                    </Label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setReferralStep('recommendations')}
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Volver
                    </Button>
                    <Button
                      onClick={handleSubmit}
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
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}

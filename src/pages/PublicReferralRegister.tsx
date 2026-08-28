import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

export default function PublicReferralRegister() {
  const { centerSlug } = useParams<{ centerSlug: string }>();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [loadingSpecialties, setLoadingSpecialties] = useState(true);
  const [centerNotFound, setCenterNotFound] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    website: '',
    description: '',
    public_name: '',
    modality: [] as string[],
    provinces: [] as string[],
    cities: [] as string[],
    specialties: [] as string[],
    privacy_accepted: false,
  });

  const [provincesInput, setProvincesInput] = useState('');
  const [citiesInput, setCitiesInput] = useState('');

  useEffect(() => {
    if (!centerSlug) return;
    (async () => {
      setLoadingSpecialties(true);
      const { data, error } = await supabase.rpc('get_public_referral_specialties', {
        center_slug: centerSlug,
      });
      if (error) {
        console.error('Error loading specialties:', error);
        setCenterNotFound(true);
      } else {
        setSpecialties((data as { name: string }[])?.map((d) => d.name) || []);
      }
      setLoadingSpecialties(false);
    })();
  }, [centerSlug]);

  const toggleModality = (mod: string) => {
    setFormData((prev) => ({
      ...prev,
      modality: prev.modality.includes(mod)
        ? prev.modality.filter((m) => m !== mod)
        : [...prev.modality, mod],
    }));
  };

  const toggleSpecialty = (spec: string) => {
    setFormData((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(spec)
        ? prev.specialties.filter((s) => s !== spec)
        : [...prev.specialties, spec],
    }));
  };

  const addProvince = () => {
    const val = provincesInput.trim();
    if (val && !formData.provinces.includes(val)) {
      setFormData((prev) => ({ ...prev, provinces: [...prev.provinces, val] }));
    }
    setProvincesInput('');
  };

  const removeProvince = (prov: string) => {
    setFormData((prev) => ({ ...prev, provinces: prev.provinces.filter((p) => p !== prov) }));
  };

  const addCity = () => {
    const val = citiesInput.trim();
    if (val && !formData.cities.includes(val)) {
      setFormData((prev) => ({ ...prev, cities: [...prev.cities, val] }));
    }
    setCitiesInput('');
  };

  const removeCity = (city: string) => {
    setFormData((prev) => ({ ...prev, cities: prev.cities.filter((c) => c !== city) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    if (formData.modality.length === 0) {
      toast.error('Selecciona al menos una modalidad');
      return;
    }
    if (!formData.privacy_accepted) {
      toast.error('Debes aceptar la política de privacidad');
      return;
    }

    setLoading(true);
    try {
      const res = await supabase.functions.invoke('public-referral-register', {
        body: { center_slug: centerSlug, ...formData },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Error al enviar la solicitud');
      } else {
        setSubmitted(true);
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (centerNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Icon name="error" className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Centro no encontrado</h2>
            <p className="text-muted-foreground">El enlace no es válido o el centro no existe.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Icon name="check_circle" className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-semibold mb-2">¡Solicitud enviada!</h2>
            <p className="text-muted-foreground">
              Tu solicitud ha sido enviada y está pendiente de aprobación. Recibirás una notificación cuando sea revisada.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Registro de profesional para derivaciones</CardTitle>
            <CardDescription>
              Completa tus datos para solicitar formar parte del catálogo de derivaciones. Tu solicitud será revisada por el administrador del centro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nombre"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellidos</Label>
                  <Input
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                    placeholder="Apellidos"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nombre público (opcional)</Label>
                <Input
                  value={formData.public_name}
                  onChange={(e) => setFormData({ ...formData, public_name: e.target.value })}
                  placeholder="Nombre a mostrar públicamente"
                />
                <p className="text-xs text-muted-foreground">Si está vacío, se usará tu nombre y apellidos</p>
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Breve descripción profesional..."
                  rows={3}
                />
              </div>

              <Separator />

              {/* Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@ejemplo.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+34 600 000 000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Web</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <Separator />

              {/* Modality */}
              <div className="space-y-2">
                <Label>Modalidades *</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.modality.includes('online') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleModality('online')}
                  >
                    <Icon name="public" className="h-4 w-4 mr-1" />
                    Online
                  </Button>
                  <Button
                    type="button"
                    variant={formData.modality.includes('presencial') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleModality('presencial')}
                  >
                    <Icon name="location_on" className="h-4 w-4 mr-1" />
                    Presencial
                  </Button>
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label>Provincias</Label>
                <div className="flex gap-2">
                  <Input
                    value={provincesInput}
                    onChange={(e) => setProvincesInput(e.target.value)}
                    placeholder="Añadir provincia..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProvince())}
                  />
                  <Button type="button" size="icon" variant="outline" onClick={addProvince}>
                    <Icon name="add" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {formData.provinces.map((prov) => (
                    <Badge key={prov} variant="secondary" className="gap-1">
                      {prov}
                      <Icon name="close" className="h-3 w-3 cursor-pointer" onClick={() => removeProvince(prov)} />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ciudades</Label>
                <div className="flex gap-2">
                  <Input
                    value={citiesInput}
                    onChange={(e) => setCitiesInput(e.target.value)}
                    placeholder="Añadir ciudad..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCity())}
                  />
                  <Button type="button" size="icon" variant="outline" onClick={addCity}>
                    <Icon name="add" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {formData.cities.map((city) => (
                    <Badge key={city} variant="secondary" className="gap-1">
                      {city}
                      <Icon name="close" className="h-3 w-3 cursor-pointer" onClick={() => removeCity(city)} />
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Specialties */}
              {loadingSpecialties ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
                  Cargando especialidades...
                </div>
              ) : specialties.length > 0 ? (
                <div className="space-y-2">
                  <Label>Especialidades</Label>
                  <div className="flex flex-wrap gap-1">
                    {specialties.map((spec) => (
                      <Badge
                        key={spec}
                        variant={formData.specialties.includes(spec) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleSpecialty(spec)}
                      >
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <Separator />

              {/* Privacy */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="privacy"
                  checked={formData.privacy_accepted}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, privacy_accepted: checked === true })
                  }
                />
                <Label htmlFor="privacy" className="text-sm font-normal leading-snug cursor-pointer">
                  He leído y acepto la{' '}
                  <a
                    href="https://psicologosexual.com/politica-de-privacidad/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    política de privacidad
                  </a>{' '}
                  *
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  loading ||
                  !formData.name.trim() ||
                  !formData.email.trim() ||
                  formData.modality.length === 0 ||
                  !formData.privacy_accepted
                }
              >
                {loading && <Icon name="progress_activity" className="h-4 w-4 animate-spin mr-2" />}
                Enviar solicitud
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

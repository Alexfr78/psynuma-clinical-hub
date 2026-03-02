import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Mail, UserPlus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { usePatientPortal } from '@/hooks/usePatientPortal';
import { toast } from 'sonner';

export default function PatientPortal() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { sendMagicLink, register } = usePatientPortal(slug);
  
  const [centerData, setCenterData] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // Register form
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
  });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  useEffect(() => {
    fetchCenterData();
  }, [slug]);

  const fetchCenterData = async () => {
    if (!slug) {
      setError('Centro no especificado');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_portal_center', { p_slug: slug })
        .maybeSingle();

      if (fetchError || !data) {
        setError('Centro no encontrado');
        setLoading(false);
        return;
      }

      setCenterData({ name: data.name, logo_url: data.logo_url });
    } catch (err) {
      console.error('Error fetching center:', err);
      setError('Error al cargar el centro');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      toast.error('Introduce tu email');
      return;
    }

    setLoginLoading(true);
    const result = await sendMagicLink(loginEmail.trim());
    setLoginLoading(false);

    if (result.success) {
      setLinkSent(true);
      toast.success('Enlace enviado a tu email');
    } else {
      toast.error(result.error || 'Error al enviar el enlace');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerForm.firstName.trim() || !registerForm.lastName.trim() || !registerForm.email.trim()) {
      toast.error('Completa los campos obligatorios');
      return;
    }

    if (!acceptPrivacy) {
      toast.error('Debes aceptar la política de privacidad');
      return;
    }

    setRegisterLoading(true);
    const result = await register({
      firstName: registerForm.firstName.trim(),
      lastName: registerForm.lastName.trim(),
      email: registerForm.email.trim(),
      phone: registerForm.phone.trim() || undefined,
      dateOfBirth: registerForm.dateOfBirth || undefined,
    });
    setRegisterLoading(false);

    if (result.success) {
      toast.success('Cuenta creada. Revisa tu email.');
      if (result.token) {
        // Redirect directly with token
        navigate(`/portal/${slug}/dashboard?token=${result.token}`);
      }
    } else {
      toast.error(result.error || 'Error al crear la cuenta');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          {centerData?.logo_url && (
            <img 
              src={centerData.logo_url} 
              alt={centerData.name} 
              className="h-16 w-auto mx-auto object-contain"
            />
          )}
          <div>
            <CardTitle className="text-2xl">{centerData?.name}</CardTitle>
            <CardDescription>Portal de Contactos</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">Acceder</span>
              </TabsTrigger>
              <TabsTrigger value="register" className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Registrarme</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              {linkSent ? (
                <div className="text-center space-y-4">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <Mail className="h-12 w-12 mx-auto text-primary mb-3" />
                    <p className="font-medium">¡Enlace enviado!</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Revisa tu bandeja de entrada y haz clic en el enlace para acceder.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setLinkSent(false)}
                    className="w-full"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Te enviaremos un enlace seguro para acceder a tu cuenta.
                  </p>
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Enviar enlace de acceso
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nombre *</Label>
                    <Input
                      id="firstName"
                      placeholder="María"
                      value={registerForm.firstName}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Apellidos *</Label>
                    <Input
                      id="lastName"
                      placeholder="García López"
                      value={registerForm.lastName}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email *</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="612 345 678"
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={registerForm.dateOfBirth}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="privacy"
                    checked={acceptPrivacy}
                    onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
                  />
                  <Label htmlFor="privacy" className="text-sm leading-tight cursor-pointer">
                    Acepto la política de privacidad y el tratamiento de mis datos personales
                  </Label>
                </div>
                <Button type="submit" className="w-full" disabled={registerLoading || !acceptPrivacy}>
                  {registerLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Crear cuenta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

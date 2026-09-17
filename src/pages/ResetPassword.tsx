import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { Icon } from '@/components/ui/icon';

const passwordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // El enlace de recuperación llega con type=recovery en el hash de la URL
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true);
      return;
    }

    // Fallback: el cliente de Supabase procesa el hash y emite el evento
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    // Si no hay sesión de recuperación en curso tras un instante, el enlace no es válido
    const timeout = setTimeout(() => {
      setIsRecovery((current) => (current === null ? false : current));
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = passwordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Contraseña actualizada',
          description: 'Tu contraseña se ha restablecido correctamente.',
        });
        navigate('/dashboard');
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isRecovery === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <Card className="w-full max-w-md shadow-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Icon name="error" className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Enlace no válido</CardTitle>
            <CardDescription>
              Este enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Volver a iniciar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-clinical shadow-clinical">
          <Icon name="psychology" className="h-9 w-9 text-primary-foreground" />
        </div>
        <h1 className="font-display text-3xl font-bold text-foreground">Psycma</h1>
        <p className="mt-1 text-muted-foreground">Gestión Clínica Profesional</p>
      </div>

      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon name="lock_reset" className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>
            Introduce tu nueva contraseña
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <div className="relative">
                <Icon name="lock" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {errors.password && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <Icon name="error" className="h-3 w-3" />
                  {errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <div className="relative">
                <Icon name="lock" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {errors.confirmPassword && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <Icon name="error" className="h-3 w-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar nueva contraseña'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

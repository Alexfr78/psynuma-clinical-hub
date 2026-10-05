import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';
import { useCompleteProfessionalSignup, usePendingSignup } from '@/hooks/useAccountAccess';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

export default function CompleteSignup() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: pending, isLoading, error } = usePendingSignup(token);
  const completeSignup = useCompleteProfessionalSignup();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setFormError(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }
    if (!token) return;
    try {
      await completeSignup.mutateAsync({ token, password });
      toast({ title: 'Cuenta creada', description: 'Ya puedes configurar tu centro.' });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    }
  };

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
        {isLoading ? (
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Comprobando el enlace...</p>
          </CardContent>
        ) : error || !pending ? (
          <>
            <CardHeader className="text-center">
              <CardTitle>Enlace no válido</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : 'El enlace no es válido o ha caducado.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/auth">Volver al acceso</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Completa tu alta</CardTitle>
              <CardDescription>
                Elige la contraseña para <strong>{pending.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Contraseña</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={completeSignup.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Repite la contraseña</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={completeSignup.isPending}
                  />
                </div>
                {formError && (
                  <p className="flex items-center gap-1 text-sm text-destructive">
                    <Icon name="error" className="h-3 w-3" />
                    {formError}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={completeSignup.isPending}>
                  {completeSignup.isPending ? 'Creando cuenta...' : 'Crear mi cuenta'}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

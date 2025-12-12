import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, Monitor, CheckCircle2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">¡App Instalada!</CardTitle>
            <CardDescription>
              Psycma ya está instalada en tu dispositivo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Abrir Psycma
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img 
              src="/pwa-192x192.png" 
              alt="Psycma" 
              className="h-20 w-20 rounded-2xl shadow-lg"
            />
          </div>
          <CardTitle className="text-2xl">Instalar Psycma</CardTitle>
          <CardDescription>
            Instala la aplicación en tu dispositivo para acceder rápidamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Benefits */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Acceso rápido</p>
                <p className="text-xs text-muted-foreground">
                  Abre Psycma directamente desde tu pantalla de inicio
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Experiencia completa</p>
                <p className="text-xs text-muted-foreground">
                  Funciona a pantalla completa sin barra del navegador
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Download className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Siempre disponible</p>
                <p className="text-xs text-muted-foreground">
                  Carga más rápido y funciona mejor sin conexión
                </p>
              </div>
            </div>
          </div>

          {/* Install button or instructions */}
          {deferredPrompt ? (
            <Button onClick={handleInstallClick} className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Instalar Aplicación
            </Button>
          ) : isIOS ? (
            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
              <p className="font-medium mb-2">Para instalar en iPhone/iPad:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Toca el botón <strong>Compartir</strong> (□↑)</li>
                <li>Desplázate y selecciona <strong>"Añadir a pantalla de inicio"</strong></li>
                <li>Toca <strong>Añadir</strong></li>
              </ol>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
              <p className="font-medium mb-2">Para instalar:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Abre el menú del navegador (⋮ o ⋯)</li>
                <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong></li>
              </ol>
            </div>
          )}

          <Button 
            variant="ghost" 
            className="w-full" 
            onClick={() => navigate('/')}
          >
            Continuar en el navegador
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

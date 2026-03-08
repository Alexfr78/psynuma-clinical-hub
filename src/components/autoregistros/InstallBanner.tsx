import { X, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

interface InstallBannerProps {
  token: string;
}

export function InstallBanner({ token }: InstallBannerProps) {
  const { canInstall, isIOS, promptInstall, dismiss, shouldShow } = useInstallPrompt(token);

  if (!shouldShow) return null;

  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {isIOS ? <Share className="h-4 w-4 text-primary" /> : <Download className="h-4 w-4 text-primary" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">Acceso rápido desde tu móvil</p>
        {canInstall ? (
          <div className="mt-2">
            <Button size="sm" onClick={promptInstall}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Añadir a inicio
            </Button>
          </div>
        ) : isIOS ? (
          <ol className="mt-1 text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
            <li>Pulsa el icono <strong>Compartir</strong> (□↑)</li>
            <li>Selecciona <strong>"Añadir a pantalla de inicio"</strong></li>
          </ol>
        ) : null}
      </div>

      <button
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

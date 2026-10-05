import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { isChunkLoadError, reloadForNewVersion } from '@/lib/lazy-page';

export function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? 'min-h-screen' : 'py-24'}`}>
      <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // `React.lazy` guarda el fallo de descarga: volver a montar no reintenta nada, así que
    // con un chunk que no carga la única salida real es recargar, quitando antes el service
    // worker para que la página nueva venga del servidor y no de su caché.
    const chunkError = isChunkLoadError(error);
    const reload = () => {
      if (!reloadForNewVersion({ force: true })) window.location.reload();
    };
    const retry = chunkError ? reload : () => this.setState({ error: null });

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Icon name="error" className="h-10 w-10 text-destructive" />
        <div>
          <h2 className="font-display text-lg font-semibold">No se pudo mostrar esta sección</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Puede deberse a una versión nueva de la aplicación. Si estás grabando una sesión,
            la grabación sigue en marcha.
          </p>
          <p className="mx-auto mt-3 max-w-xl break-words font-mono text-xs text-muted-foreground/70">
            {chunkError ? 'No se pudo descargar la página' : 'Error'}: {error.message || String(error)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={retry}>
            Reintentar
          </Button>
          <Button onClick={chunkError ? reload : () => window.location.reload()}>Recargar página</Button>
        </div>
      </div>
    );
  }
}

/**
 * Límite de error + Suspense para el contenido de una ruta. Aísla el fallo de una página
 * (render o chunk que no carga) para que no deje la app en blanco ni desmonte lo que vive
 * por encima, como la grabadora web. Se reinicia al cambiar de ruta.
 */
export function RouteBoundary({ children, fullScreen = false }: { children: ReactNode; fullScreen?: boolean }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageLoader fullScreen={fullScreen} />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

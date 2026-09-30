import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

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
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Icon name="error" className="h-10 w-10 text-destructive" />
        <div>
          <h2 className="font-display text-lg font-semibold">No se pudo mostrar esta sección</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Puede deberse a una versión nueva de la aplicación. Si estás grabando una sesión,
            la grabación sigue en marcha.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Reintentar
          </Button>
          <Button onClick={() => window.location.reload()}>Recargar página</Button>
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

import { lazy, type ComponentType } from 'react';
import { isPwaReloadBlocked } from '@/lib/pwa-update-guard';

/**
 * Carga diferida de una página (un chunk por ruta).
 *
 * Con un único bundle, una pestaña abierta durante un despliegue seguía funcionando con el
 * código viejo en memoria. Al partir por rutas aparece un fallo nuevo: esa pestaña pide el
 * chunk de una página que aún no había visitado, con el hash del despliegue anterior, y el
 * servidor ya no lo tiene. La salida es recargar una vez para traer el `index.html` nuevo.
 *
 * No se recarga si hay una grabación en curso (ver `pwa-update-guard.ts`): en ese caso el
 * error sube a `RouteErrorBoundary`, que lo muestra sin desmontar la grabadora.
 */
const RELOAD_FLAG = 'psycma:chunk-reload';

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return true; // Sin sessionStorage no hay forma de evitar un bucle de recargas.
  }
}

function markReloaded(value: boolean) {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // Ignorado: solo es una protección contra bucles.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().then(
      (module) => {
        markReloaded(false);
        return module;
      },
      (error: unknown) => {
        if (isPwaReloadBlocked() || alreadyReloaded()) throw error;
        markReloaded(true);
        window.location.reload();
        // La página se va a recargar: no resolver evita pintar el error un instante.
        return new Promise<never>(() => {});
      },
    ),
  );
}

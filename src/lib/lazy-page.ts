import { lazy, type ComponentType } from 'react';
import { isPwaReloadBlocked } from '@/lib/pwa-update-guard';

/**
 * Carga diferida de una página (un chunk por ruta).
 *
 * Con un único bundle, una pestaña abierta durante un despliegue seguía funcionando con el
 * código viejo en memoria. Al partir por rutas aparece un fallo nuevo: esa pestaña pide el
 * chunk de una página que aún no había visitado, con el hash del despliegue anterior, y el
 * servidor ya no lo tiene. La salida es recargar para traer el `index.html` nuevo.
 *
 * Antes de recargar se reintenta la descarga una vez: muchos fallos son cortes de red
 * momentáneos (móvil, wifi que cambia) y el chunk sí existe.
 *
 * No se recarga si hay una grabación en curso (ver `pwa-update-guard.ts`): en ese caso el
 * error sube a `RouteErrorBoundary`, que lo muestra sin desmontar la grabadora.
 */
const RELOAD_AT_KEY = 'psycma:chunk-reload-at';
/** Si ya se recargó hace menos de esto, recargar otra vez sería un bucle. */
const RELOAD_COOLDOWN_MS = 30_000;
const RETRY_DELAY_MS = 1_000;

const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
  'unable to preload css', // Vite
  'loading chunk', // Webpack/legacy
  'loading css chunk',
];

/** Fallo al descargar el código de una página (no un error de la propia página). */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? `${error.name} ${error.message}` : String(error)).toLowerCase();
  return message.includes('chunkloaderror') || CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));
}

function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_AT_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < RELOAD_COOLDOWN_MS;
  } catch {
    return true; // Sin sessionStorage no hay forma de evitar un bucle de recargas.
  }
}

/**
 * Quita el service worker antes de recargar. Si sigue controlando la pestaña, la recarga
 * recibe el `index.html` viejo de su precaché, que vuelve a pedir el chunk que ya no
 * existe, y la recarga no arregla nada. Se vuelve a registrar solo al cargar la página.
 */
async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
  } catch {
    // Si falla, se recarga igual.
  }
}

/**
 * Recarga la página para traer la versión nueva, salvo que haya una grabación en curso o
 * se haya recargado hace muy poco (`force` se salta esto último: lo pide el usuario).
 * Devuelve si va a recargar.
 */
export function reloadForNewVersion({ force = false }: { force?: boolean } = {}): boolean {
  if (isPwaReloadBlocked() || (!force && reloadedRecently())) return false;
  try {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    if (!force) return false;
  }
  void unregisterServiceWorkers().finally(() => window.location.reload());
  return true;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      await wait(RETRY_DELAY_MS);
      try {
        return await factory();
      } catch {
        if (!reloadForNewVersion()) throw firstError;
        // La página se va a recargar: no resolver evita pintar el error un instante.
        return new Promise<never>(() => {});
      }
    }
  });
}

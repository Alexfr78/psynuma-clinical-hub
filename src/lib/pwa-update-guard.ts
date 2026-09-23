/**
 * Aplaza la recarga automática de la PWA mientras haya algo que no puede sobrevivir a
 * un refresco de página, hoy una grabación de sesión en curso.
 *
 * `registerPwa.ts` comprueba si hay versión nueva cada 10 segundos y, cuando la hay,
 * recarga la página sin preguntar. Eso es correcto para una app de gestión, pero con la
 * grabadora significa que cualquier despliegue corta una sesión de 50 minutos a mitad:
 * el MediaRecorder muere con la página. El audio ya subido se conserva, pero lo que
 * quede de sesión se pierde y no se puede reanudar el micrófono.
 *
 * La actualización no se descarta: queda en espera y se aplica en cuanto se libera el
 * último bloqueo.
 */

let blockers = 0;
let deferred: (() => void) | null = null;

/** Bloquea la recarga automática. Devuelve la función que la libera (idempotente). */
export function blockPwaReload(): () => void {
  blockers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    blockers = Math.max(0, blockers - 1);
    if (blockers === 0 && deferred) {
      const run = deferred;
      deferred = null;
      run();
    }
  };
}

export function isPwaReloadBlocked(): boolean {
  return blockers > 0;
}

/**
 * Ejecuta la recarga ahora o la deja pendiente hasta que se libere el bloqueo. Solo se
 * guarda una: recargar dos veces seguidas no aporta nada.
 */
export function runWhenPwaReloadAllowed(reload: () => void): void {
  if (blockers === 0) {
    reload();
    return;
  }
  deferred = reload;
  console.log('[PWA] Actualización disponible: se aplicará al terminar la grabación.');
}

/**
 * Redirige el navegador saliendo del iframe cuando el contenido está embebido
 * (portal de pacientes / reserva pública incrustados en el WordPress del centro,
 * normalmente cross-origin). Stripe Checkout no puede cargarse dentro de un
 * iframe, así que hay que navegar el contexto de nivel superior.
 *
 * En cross-origin no se puede leer/escribir `window.top.location`, pero sí
 * navegarlo con `window.open(url, '_top')`.
 */
export function redirectTopLevel(url: string): void {
  try {
    if (window.self !== window.top) {
      window.open(url, '_top');
      return;
    }
  } catch {
    // Acceder a window.top puede lanzar en algunos navegadores; intenta _top igual.
    window.open(url, '_top');
    return;
  }
  window.location.assign(url);
}

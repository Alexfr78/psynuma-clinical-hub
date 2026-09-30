/**
 * Patrón para `.filter('search_text', 'ilike', …)` a partir de lo que escribe el usuario.
 * Nunca se interpola en una expresión or(): va como valor de un filtro directo.
 */
export function listSearchPattern(search: string): string {
  // Los comodines que teclee el usuario se quitan para que busquen literalmente; la barra se escapa.
  const term = search.trim().replace(/[*%_]/g, '').replace(/\\/g, '\\\\');
  // Un término formado solo por comodines queda vacío: `ilike ''` no devuelve nada, como antes
  // (en el navegador, buscar "%%" tampoco encontraba registros). Nunca devuelve todo el listado.
  return term ? `*${term}*` : '';
}

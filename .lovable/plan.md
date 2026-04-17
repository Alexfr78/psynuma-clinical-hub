
Objetivo: corregir de forma robusta la carga del portal público de reservas, porque ahora mismo la pantalla puede quedarse en “Selecciona un servicio” sin opciones y sin mensaje útil.

Diagnóstico actual
- El frontend (`src/pages/PublicBooking.tsx`) hace 4 llamadas separadas al abrir la página: `get-config`, `list-services`, `list-locations`, `list-professionals`.
- Si alguna de esas llamadas falla o devuelve vacío, la UI no muestra error ni estado vacío: simplemente renderiza la pantalla del paso actual sin contenido.
- La edge function `public-booking` aplica rate limit a todas las acciones, incluidas las de lectura. Eso significa que abrir/reintentar la página, cambiar de mes o navegar varias veces puede agotar el límite y provocar respuestas parciales.
- Además, la PWA se está registrando globalmente (`src/registerPwa.ts`) sin proteger iframe/preview, lo que puede servir bundles antiguos en el portal publicado o embebido.

Plan de implementación

1. Endurecer la carga inicial del portal
- Sustituir las 4 llamadas iniciales por una sola acción backend tipo `bootstrap` / `get-initial-data`.
- Esa respuesta incluirá:
  - config del centro
  - servicios públicos
  - ubicaciones públicas
  - profesionales
  - bandera `allowProfessionalSelection`
- Así evitamos estados parciales y reducimos mucho el riesgo de rate limit.

2. Corregir el rate limiting del backend público
- Ajustar `supabase/functions/public-booking/index.ts` para no tratar igual lectura y escritura.
- Mantener rate limit estricto en acciones sensibles (`create-booking`, `submit-intake-request`, quizá `get-referral-recommendations`).
- Relajar o excluir del límite la carga inicial y consultas de disponibilidad (`get-config`, `list-*`, `get-availability`, `get-availability-month`) o aplicarles umbrales más altos por acción.
- Añadir logs más claros para distinguir “sin datos configurados” vs “bloqueado por rate limit”.

3. Mejorar la UX del portal cuando falten datos o haya errores
- En `src/pages/PublicBooking.tsx`, mostrar estados explícitos:
  - “No hay servicios públicos configurados”
  - “No hay ubicaciones públicas disponibles”
  - “Error al cargar la reserva pública”
  - mensaje específico si llega 429 / límite temporal
- Añadir botón de reintentar.
- Evitar que el usuario vea una tarjeta vacía sin contexto.

4. Blindar la PWA para que no rompa el portal público
- Revisar `src/registerPwa.ts` y `vite.config.ts`.
- No registrar service worker en preview, en iframe o en rutas embebidas.
- Desregistrar workers existentes en esos contextos para limpiar caché problemática.
- Mantener la app instalable, pero sin dejar que el portal público quede atado a una versión vieja.

5. Verificación funcional
- Probar el flujo en:
  - dominio publicado
  - dominio personalizado
  - URL embebida `?embed=1`
  - móvil/ancho pequeño
- Validar 4 casos:
  - carga de servicios
  - carga de ubicaciones
  - calendario mensual
  - slots del día 30
- Confirmar también que, si realmente no hay servicios/ubicaciones públicas, el mensaje mostrado sea correcto y no una pantalla “vacía”.

Detalles técnicos
- Archivos principales a tocar:
  - `src/pages/PublicBooking.tsx`
  - `src/hooks/usePublicBooking.tsx`
  - `supabase/functions/public-booking/index.ts`
  - `src/registerPwa.ts`
  - `vite.config.ts`
- Causa más probable ahora mismo:
  - combinación de respuestas parciales + ausencia de empty/error states + caché PWA/rate limit.
- Lo importante es que el backend de disponibilidad ya había mostrado slots en llamadas previas; el problema parece estar en la capa de carga/render del portal público, no en la lógica pura de disponibilidad.

Resultado esperado tras el cambio
- La página pública siempre mostrará uno de estos estados válidos:
  - contenido cargado
  - error explícito con reintento
  - vacío explícito por falta de configuración
- Ya no debería quedarse en una pantalla aparentemente rota o “en blanco” sin servicios.

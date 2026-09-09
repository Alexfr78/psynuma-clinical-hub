/**
 * Recepción de audio compartido desde el menú "Compartir" de Android.
 *
 * El manifiesto declara `share_target` con `method: "POST"`, así que Android envía el fichero
 * como `multipart/form-data` a `/compartir-audio`. Ese POST NO puede llegar al servidor: la app
 * es una SPA estática y no hay nada que lo atienda. El patrón estándar es interceptarlo aquí,
 * guardar el fichero en Cache Storage y responder con una redirección a la misma ruta por GET,
 * que ya sirve el shell de la SPA desde el precaché.
 *
 * Este archivo lo carga workbox con `importScripts` (ver `vite.config.ts`), que se ejecuta antes
 * de que workbox registre sus propias rutas — por eso este listener tiene prioridad. Solo
 * responde al POST de la ruta de compartir; cualquier otra petición sigue su curso normal.
 */

const SHARED_AUDIO_CACHE = 'psycma-shared-audio';
const SHARED_AUDIO_KEY = '/__psycma-shared-audio__';
const SHARE_TARGET_PATH = '/compartir-audio';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'POST' || url.pathname !== SHARE_TARGET_PATH) return;

  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.getAll('audio').find((entry) => entry && entry.size > 0);

        if (!file) {
          return Response.redirect(`${SHARE_TARGET_PATH}?estado=vacio`, 303);
        }

        const cache = await caches.open(SHARED_AUDIO_CACHE);
        await cache.put(
          SHARED_AUDIO_KEY,
          new Response(file, {
            headers: {
              // encodeURIComponent porque una cabecera HTTP no admite caracteres no ASCII y
              // los nombres de grabación pueden traer tildes o eñes.
              'X-Shared-Filename': encodeURIComponent(file.name || ''),
              'X-Shared-Type': file.type || '',
              'X-Shared-At': String(Date.now()),
            },
          }),
        );

        return Response.redirect(`${SHARE_TARGET_PATH}?estado=recibido`, 303);
      } catch (error) {
        return Response.redirect(`${SHARE_TARGET_PATH}?estado=error`, 303);
      }
    })(),
  );
});

/**
 * Lectura del audio que llega por el menú "Compartir" de Android.
 *
 * El service worker (`public/share-target-sw.js`) intercepta el POST del share target y deja el
 * fichero en Cache Storage; aquí se recupera desde la página. Los nombres de caché y de clave
 * deben coincidir exactamente con los de ese archivo.
 */

const SHARED_AUDIO_CACHE = 'psycma-shared-audio';
const SHARED_AUDIO_KEY = '/__psycma-shared-audio__';

/**
 * `transcribe-session-audio` valida el formato por la EXTENSIÓN del nombre de archivo, no por el
 * tipo MIME. Algunas apps comparten el audio con un nombre genérico y sin extensión, así que hay
 * que derivarla del tipo para que la función no rechace un fichero perfectamente válido.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
};

const ACCEPTED_EXTENSIONS = ['.mp3', '.mp4', '.m4a', '.wav', '.webm', '.ogg', '.flac'];

function ensureExtension(name: string, mimeType: string): string {
  const base = name.trim() || 'grabacion';
  if (ACCEPTED_EXTENSIONS.some((ext) => base.toLowerCase().endsWith(ext))) return base;

  const derived = EXTENSION_BY_MIME[mimeType.toLowerCase().split(';')[0].trim()];
  return derived ? `${base}${derived}` : base;
}

export interface SharedAudio {
  file: File;
  sharedAt: Date;
}

export async function readSharedAudio(): Promise<SharedAudio | null> {
  if (typeof caches === 'undefined') return null;

  const cache = await caches.open(SHARED_AUDIO_CACHE);
  const response = await cache.match(SHARED_AUDIO_KEY);
  if (!response) return null;

  const blob = await response.blob();
  const rawName = response.headers.get('X-Shared-Filename') ?? '';
  const mimeType = response.headers.get('X-Shared-Type') || blob.type || 'audio/mpeg';

  let name = '';
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }

  const sharedAtMs = Number(response.headers.get('X-Shared-At'));

  return {
    file: new File([blob], ensureExtension(name, mimeType), { type: mimeType }),
    sharedAt: new Date(Number.isFinite(sharedAtMs) && sharedAtMs > 0 ? sharedAtMs : Date.now()),
  };
}

export async function clearSharedAudio(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(SHARED_AUDIO_CACHE);
  await cache.delete(SHARED_AUDIO_KEY);
}

import { registerSW } from "virtual:pwa-register";

let hasControllerChanged = false;

/**
 * Detect contexts where registering a Service Worker would cause stale
 * content or break embedded usage:
 *  - Lovable preview / sandbox hosts
 *  - Inside an iframe (e.g. embedded public booking widget)
 *  - Public embed routes (?embed=1 or /reservas|/book)
 */
function shouldSkipServiceWorker(): boolean {
  if (typeof window === "undefined") return true;

  // Inside an iframe (cross-origin throws → assume iframe)
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe) return true;

  const host = window.location.hostname;
  // Skip on Lovable preview/sandbox/dev hosts. Keep enabled on the published
  // *.lovable.app domain and on user custom domains.
  if (
    host.includes("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return true;
  }

  const search = window.location.search || "";
  const path = window.location.pathname || "";
  if (search.includes("embed=1")) return true;
  if (path.startsWith("/reservas") || path.startsWith("/book")) return true;

  return false;
}

async function unregisterExistingWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
  } catch {
    // ignore
  }
}

export function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (shouldSkipServiceWorker()) {
    // Make sure no stale worker keeps serving cached bundles in iframe/preview/embed.
    void unregisterExistingWorkers();
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Force update check immediately and frequently
      registration.update().catch(() => undefined);

      window.setInterval(() => {
        registration.update().catch(() => undefined);
      }, 10 * 1000); // 10 seconds for preview environments
    },
    onNeedRefresh() {
      console.log('[PWA] New version available, forcing refresh...');
      void updateSW(true);
    },
    onOfflineReady() {},
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasControllerChanged) return;
    hasControllerChanged = true;
    console.log('[PWA] Controller changed, reloading...');
    window.location.reload();
  });
}

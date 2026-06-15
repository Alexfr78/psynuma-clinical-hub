import { registerSW } from "virtual:pwa-register";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

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
  if (!("serviceWorker" in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    return results.some(Boolean);
  } catch {
    // ignore
    return false;
  }
}

export function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (shouldSkipServiceWorker()) {
    // Make sure no stale worker keeps serving cached bundles in iframe/preview/embed.
    void unregisterExistingWorkers().then((removed) => {
      const reloadKey = 'psycma-sw-clean-reloaded';
      if ((removed || navigator.serviceWorker.controller) && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    });
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      let lastUpdateCheck = 0;

      const checkForUpdate = () => {
        if (document.visibilityState !== "visible") return;

        const now = Date.now();
        if (now - lastUpdateCheck < UPDATE_INTERVAL_MS) return;

        lastUpdateCheck = now;
        registration.update().catch(() => undefined);
      };

      checkForUpdate();
      window.addEventListener("online", checkForUpdate);
      document.addEventListener("visibilitychange", checkForUpdate);
    },
    onNeedRefresh() {
      // Activate the update without forcing a page reload. Reloading during a
      // mobile visibility transition can leave Safari/Chrome in a stalled state.
      void updateSW(true);
    },
    onOfflineReady() {},
  });
}

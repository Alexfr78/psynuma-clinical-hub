import { registerSW } from "virtual:pwa-register";

let hasControllerChanged = false;

export function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      registration.update().catch(() => undefined);

      window.setInterval(() => {
        registration.update().catch(() => undefined);
      }, 60 * 1000);
    },
    onNeedRefresh() {
      void updateSW(true);
    },
    onOfflineReady() {},
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasControllerChanged) return;
    hasControllerChanged = true;
    window.location.reload();
  });
}
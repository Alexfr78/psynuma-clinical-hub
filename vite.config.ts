import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      injectRegister: null,
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "Psycma - Gestión Clínica",
        short_name: "Psycma",
        description: "Gestión clínica profesional para psicólogos y terapeutas",
        theme_color: "#0ea5e9",
        background_color: "#3aa0c4",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Public invoice and payment links must never be served by a stale SPA
        // navigation fallback, especially on installed PWAs and iOS Safari.
        // /cita/ now also drives a Stripe checkout (session + bono purchase),
        // so it needs the same treatment as /factura/ and /pagar/.
        // Rutas públicas que abre el paciente desde un enlace: las sirve el
        // servidor, no el service worker. Si se cachean, un despliegue nuevo
        // puede dejarlas en blanco mientras el SW toma el control.
        // Toda ruta pública nueva debe añadirse aquí.
        navigateFallbackDenylist: [
          /^\/factura\//,
          /^\/pagar\//,
          /^\/cita\//,
          /^\/consentimiento\//,
          /^\/evaluacion\//,
          /^\/emo\//,
          /^\/registro\//,
          /^\/enlace\//,
          /^\/portal\//,
          /^\/book\//,
          /^\/reservas\//,
          /^\/derivaciones\//,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

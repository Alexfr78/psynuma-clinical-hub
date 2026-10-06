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
        // Hace que Psycma aparezca en el menú "Compartir" de Android para archivos de audio.
        // Android manda el fichero por POST a esta ruta; lo intercepta el service worker
        // (`public/share-target-sw.js`), porque la SPA no puede atender un POST. Solo funciona
        // con la app instalada en el móvil, y no existe en iOS: Safari no soporta share target.
        share_target: {
          action: "/compartir-audio",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            files: [
              {
                name: "audio",
                accept: ["audio/*", ".mp3", ".m4a", ".wav", ".webm", ".ogg", ".flac"],
              },
            ],
          },
        },
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
        // La app NO se precachea: ni index.html ni los chunks. Con precaché, el service worker
        // servía un index.html de una versión anterior que pedía chunks ya borrados del
        // servidor tras cada publicación ("No se pudo mostrar esta sección"). Psycma necesita
        // red para todo (Supabase), así que el modo sin conexión no aportaba nada. index.html
        // llega siempre del servidor (no-cache) y los chunks, con hash, de la caché HTTP.
        // Solo se precachean iconos e imágenes, que no cambian con cada despliegue.
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
        navigateFallback: null,
        // Se carga al principio del service worker generado, antes de que workbox registre sus
        // rutas — por eso su listener de fetch atrapa el POST del share target primero.
        // Excluido del precaché porque no es un asset de la app: lo carga el propio SW.
        importScripts: ["/share-target-sw.js"],
        globIgnores: ["**/share-target-sw.js"],
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

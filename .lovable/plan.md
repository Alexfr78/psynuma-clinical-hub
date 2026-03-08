

## Plan: Acceso directo "Añadir a pantalla de inicio" en Autoregistro Público

### Contexto
La página pública de autoregistro (`/autoregistro/:token`) es visitada por pacientes desde el móvil. Queremos que la primera vez que entran, se les ofrezca crear un acceso directo en la pantalla de inicio para acceder más rápido.

### Enfoque técnico
Usar la **Web App Install Prompt API** (`beforeinstallprompt`). Esta API permite interceptar el evento de instalación de PWA y mostrarlo de forma personalizada. Sin embargo, dado que cada autoregistro es una URL con token específico, la alternativa más fiable y universal (funciona en iOS y Android) es mostrar un **banner informativo** con instrucciones para añadir a la pantalla de inicio, ya que iOS Safari no soporta `beforeinstallprompt`.

**Solución híbrida:**
1. **Android/Chrome**: Capturar el evento `beforeinstallprompt` y ofrecer el botón de instalación nativo.
2. **iOS/Safari**: Mostrar instrucciones visuales ("Pulsa Compartir → Añadir a pantalla de inicio").
3. **Control de primera vez**: Guardar en `localStorage` un flag `autoregistro_install_dismissed_{token}` para no volver a mostrar el banner tras descartarlo.

### Cambios

#### 1. Crear hook `src/hooks/useInstallPrompt.tsx`
- Escucha el evento `beforeinstallprompt` y guarda la referencia.
- Detecta si es iOS (User Agent).
- Expone: `canInstall`, `isIOS`, `promptInstall()`, `dismissed`, `dismiss()`.
- Usa `localStorage` con clave basada en token para recordar si se descartó.

#### 2. Crear componente `src/components/autoregistros/InstallBanner.tsx`
- Banner compacto que aparece arriba del formulario.
- En Android: botón "Añadir a inicio" que llama a `promptInstall()`.
- En iOS: instrucciones con icono de compartir.
- Botón X para descartar (guarda en localStorage).
- Solo se muestra la primera vez (si no fue descartado previamente).

#### 3. Modificar `src/pages/AutoregistroPublic.tsx`
- Importar y renderizar `InstallBanner` dentro del layout principal, encima de la Card del formulario.

### Archivos afectados
- `src/hooks/useInstallPrompt.tsx` (nuevo)
- `src/components/autoregistros/InstallBanner.tsx` (nuevo)
- `src/pages/AutoregistroPublic.tsx` (minor: añadir banner)


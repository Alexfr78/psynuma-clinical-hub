

## Plan: Revertir `onPointerDown`/`onPointerUp` de popover.tsx

### Diagnóstico
El replay de sesión confirma que el usuario toca el input repetidamente (elemento 1794) y cmdk responde cambiando la selección de items (`aria-selected`), pero el teclado virtual nunca se activa. El input recibe los taps pero no gana foco de escritura.

**Causa raíz**: El `onPointerDown={(e) => e.stopPropagation()}` añadido a `PopoverContent` en esta misma conversación impide que el evento `pointerdown` burbujee al documento. En navegadores móviles (especialmente Safari iOS), el mecanismo interno del navegador para activar el teclado virtual necesita ver el `pointerdown` propagarse hasta el nivel del documento. Al cortarlo con `stopPropagation`, el navegador no reconoce el tap como gesto de usuario para abrir el teclado.

Esto explica por qué **antes funcionaba** (no había stopPropagation en pointerdown) y ahora no.

### Solución

**Archivo: `src/components/ui/popover.tsx`**
- Eliminar `onPointerDown` y `onPointerUp` stopPropagation (líneas 27-28)
- Mantener `onTouchStart/Move/End` stopPropagation que son suficientes para evitar el drag del Drawer

Solo se modifica un archivo, dos líneas eliminadas.


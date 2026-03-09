

## Plan: Corregir interacción táctil del selector de contacto en móvil

### Problema raíz
El `PopoverContent` se renderiza en un **Portal** (fuera del DOM del Drawer). Aunque `data-vaul-no-drag` funciona para elementos *dentro* del Drawer, el Portal coloca el contenido fuera de ese árbol DOM. El overlay del Drawer (`z-50`, `bg-black/80`) sigue capturando eventos táctiles antes de que lleguen al PopoverContent, incluso con `z-[9999]` y `pointer-events-auto`.

Los atributos `data-vaul-no-drag` y `modal={false}` no resuelven el problema porque el Drawer overlay intercepta `touchstart`/`touchmove` a nivel global.

### Solución
Interceptar los eventos táctiles directamente en el `PopoverContent` para que no se propaguen al overlay del Drawer. Modificar el componente `PopoverContent` en `src/components/ui/popover.tsx` para detener la propagación de `touchstart`, `touchmove` y `touchend` cuando se usa dentro de un Drawer.

Esto se aplica de forma centralizada en el componente base, corrigiendo todos los selectores afectados de una vez.

### Cambios

**Archivo: `src/components/ui/popover.tsx`**
- Añadir `onPointerDownOutside` handler para evitar que el Popover se cierre al tocar el input
- Envolver el `PopoverPrimitive.Content` en un `div` con handlers `onTouchStart`, `onTouchMove`, `onTouchEnd` que llamen a `e.stopPropagation()` para evitar que los eventos táctiles lleguen al overlay del Drawer

Alternativa más limpia: añadir los `stopPropagation` handlers directamente en las props del `PopoverPrimitive.Content` sin necesidad de un div wrapper.

```tsx
// En popover.tsx - añadir al PopoverPrimitive.Content:
onTouchStart={(e) => e.stopPropagation()}
onTouchMove={(e) => e.stopPropagation()}  
onTouchEnd={(e) => e.stopPropagation()}
```

Esto es seguro porque el PopoverContent ya está en un Portal aislado — detener la propagación solo evita que el evento burbujee al overlay del Drawer sin afectar la funcionalidad interna del Command/Input.

### Archivos a modificar
1. `src/components/ui/popover.tsx` — añadir touch event stopPropagation


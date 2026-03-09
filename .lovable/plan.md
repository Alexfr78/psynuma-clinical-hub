

## Plan: Corregir input de búsqueda de contacto en móvil

### Problema raíz
En móvil, el `PopoverContent` se renderiza en un Portal fuera del Drawer. Aunque el `stopPropagation` evita que el Drawer arrastre, el input de cmdk (`CommandInput`) no recibe el foco correctamente porque el Drawer captura el evento `pointerdown` antes de que el input pueda activar el teclado virtual. El `stopPropagation` de touch events no cubre `pointerdown`/`pointerup`, que son los eventos que usa Radix y el navegador para gestionar el foco.

### Solución
Dos cambios complementarios:

**1. `src/components/ui/popover.tsx`** — Añadir `onPointerDown` stopPropagation para que el Drawer no capture el evento de foco, y mover los handlers DESPUÉS de `{...props}` para que no sean sobrescritos:

```tsx
<PopoverPrimitive.Content
  ref={ref}
  align={align}
  sideOffset={sideOffset}
  className={cn(...)}
  {...props}
  onPointerDownOutside={(e) => {
    // Allow closing but call user handler first
    props.onPointerDownOutside?.(e);
  }}
  onTouchStart={(e) => e.stopPropagation()}
  onTouchMove={(e) => e.stopPropagation()}
  onTouchEnd={(e) => e.stopPropagation()}
  onPointerDown={(e) => e.stopPropagation()}
  onPointerUp={(e) => e.stopPropagation()}
/>
```

**2. `src/components/agenda/QuickCreateSessionDialog.tsx`** — Añadir `onOpenAutoFocus` al PopoverContent del selector de pacientes para forzar el foco en el input de búsqueda al abrir:

```tsx
<PopoverContent 
  className="..."
  onOpenAutoFocus={(e) => {
    e.preventDefault();
    // Focus the search input after a small delay for mobile
    setTimeout(() => {
      const input = e.currentTarget?.querySelector('input');
      input?.focus();
    }, 50);
  }}
>
```

### Archivos a modificar
1. `src/components/ui/popover.tsx` — añadir `onPointerDown`/`onPointerUp` stopPropagation
2. `src/components/agenda/QuickCreateSessionDialog.tsx` — añadir `onOpenAutoFocus` para forzar foco en input


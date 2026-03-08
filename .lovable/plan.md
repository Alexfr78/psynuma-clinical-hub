

## Problema

Los menús desplegables (tres puntos) dentro del Drawer no responden en móvil. Ya se aplicó `pointer-events-auto` y `z-[9999]` al `DropdownMenuContent`, pero no funciona porque **Vaul Drawer** intercepta los eventos táctiles a nivel de gesture handler, no solo con CSS.

El `DropdownMenuContent` se renderiza mediante un `Portal` al `body`, pero el Drawer de Vaul tiene un overlay a pantalla completa que captura los toques antes de que lleguen al dropdown, independientemente del z-index.

## Solución

Añadir una prop opcional `usePortal` al componente `DropdownMenuContent` (default `true`). Cuando se usa `usePortal={false}`, el contenido se renderiza **inline** (sin Portal), posicionándose relativo a su padre dentro del Drawer. Como ya está dentro del portal del Drawer, no necesita su propio portal.

### Cambios

**1. `src/components/ui/dropdown-menu.tsx`** — Añadir prop `usePortal` a `DropdownMenuContent`:

```tsx
// Acepta usePortal?: boolean (default true)
// Si usePortal es false, renderiza Content directamente sin envolver en Portal
const Wrapper = usePortal ? DropdownMenuPrimitive.Portal : React.Fragment;
return (
  <Wrapper>
    <DropdownMenuPrimitive.Content ... />
  </Wrapper>
);
```

**2. `src/components/consents/ConsentCard.tsx`** — Usar `usePortal={false}` en el dropdown que se abre dentro de drawers:

```tsx
<DropdownMenuContent align="end" usePortal={false}>
```

Esto hará que el menú se posicione dentro del flujo del Drawer, donde los eventos táctiles funcionan correctamente.


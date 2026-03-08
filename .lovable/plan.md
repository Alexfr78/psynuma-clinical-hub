

## Problema

Los menús desplegables (tres puntos) dentro del Drawer en móvil no responden a toques. Esto ocurre porque **Vaul Drawer** establece `pointer-events: none` en el `body` cuando está abierto. El `DropdownMenuContent` se renderiza via Portal a nivel de `body`, heredando ese bloqueo de eventos táctiles. Ni el `z-index` alto ni `modal={false}` resuelven esto.

## Solución

Modificar `DropdownMenuContent` en `src/components/ui/dropdown-menu.tsx` para incluir `pointer-events-auto` en sus clases CSS. Esto fuerza al contenido del dropdown a aceptar eventos táctiles independientemente de lo que el padre (`body`) tenga configurado.

### Cambio único

**`src/components/ui/dropdown-menu.tsx`** — Añadir `pointer-events-auto` a la clase del `DropdownMenuPrimitive.Content`:

```
// Antes
"z-[9999] min-w-[8rem] overflow-hidden ..."

// Después  
"z-[9999] pointer-events-auto min-w-[8rem] overflow-hidden ..."
```


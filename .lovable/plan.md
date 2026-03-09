

## Plan: Corregir foco del input de búsqueda de contacto en móvil

### Problema raíz
El `onOpenAutoFocus` actual usa `e.currentTarget?.querySelector('input')` pero en un Portal de Radix, `e.currentTarget` puede ser `null` o no corresponder al DOM esperado cuando se ejecuta dentro de un Drawer en móvil. Además, el `CommandInput` de cmdk renderiza un input nativo envuelto en un div — el input no recibe foco porque el Drawer sigue interceptando los eventos de puntero a nivel del input individual (el `stopPropagation` del `PopoverContent` solo protege el contenedor, no garantiza que el input hijo reciba el foco inicial).

### Solución
Reemplazar el mecanismo de auto-foco por una ref directa al input, y añadir un efecto que fuerce el foco cuando el popover se abre:

**Archivo: `src/components/agenda/QuickCreateSessionDialog.tsx`**

1. Añadir un `useRef` para el input de búsqueda de pacientes
2. Usar un `useEffect` que observe `patientPopoverOpen` y fuerce `inputRef.current?.focus()` con un delay de 100ms (más fiable que 50ms en móviles lentos)
3. Pasar la ref al `CommandInput` mediante una prop `ref`
4. Eliminar el `onOpenAutoFocus` actual que no funciona

**Archivo: `src/components/ui/command.tsx`**

El `CommandInput` actualmente no expone `ref` al input nativo — lo pasa al `CommandPrimitive.Input`. Verificar que el forwardRef funciona correctamente para poder usar `inputRef.current?.focus()`.

### Cambios concretos

```tsx
// QuickCreateSessionDialog.tsx
const patientInputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  if (patientPopoverOpen) {
    setTimeout(() => {
      patientInputRef.current?.focus();
    }, 100);
  }
}, [patientPopoverOpen]);

// En el JSX, quitar onOpenAutoFocus y añadir ref al CommandInput:
<CommandInput 
  ref={patientInputRef}
  placeholder="Buscar contacto..." 
  ...
/>
```

### Archivos a modificar
1. `src/components/agenda/QuickCreateSessionDialog.tsx` — ref + useEffect para foco automático


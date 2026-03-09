

## Plan: Reemplazar Popover por Command inline en móvil para el selector de paciente

### Diagnóstico real

El problema NO es de stopPropagation ni de refs. El problema fundamental es que **Vaul (Drawer) gestiona el foco internamente** y cuando el Popover renderiza su contenido en un **Portal fuera del DOM del Drawer**, Vaul recaptura el foco de vuelta al Drawer. Además, en iOS Safari el teclado virtual solo se activa con un gesto directo del usuario, y los `setTimeout` + `focus()` no cuentan como gesto.

Por eso los intentos anteriores con `onPointerDown`, `useRef` + `useEffect`, y `onOpenAutoFocus` no funcionaron: todos intentan forzar foco asíncronamente en un elemento que está en un Portal fuera del Drawer.

### Solución

En móvil, **no usar Popover**. Reemplazar el patrón Popover+Command por un **Command inline expandible** que se muestra/oculta directamente dentro del DOM del Drawer (sin Portal). Así no hay conflicto de foco.

### Cambios

**Archivo: `src/components/agenda/QuickCreateSessionDialog.tsx`**

En la sección del selector de paciente (líneas ~765-850):

1. Importar `useIsMobile` 
2. En móvil: cuando el usuario toca "Buscar paciente...", mostrar el Command directamente debajo del botón (inline, sin Popover ni Portal), con un input nativo que recibe foco naturalmente
3. En desktop: mantener el Popover actual sin cambios
4. Eliminar el `useRef` + `useEffect` de foco que ya no es necesario

```tsx
// Concepto del cambio:
const isMobile = useIsMobile();

// En el JSX:
{isMobile ? (
  <>
    <Button onClick={() => setPatientPopoverOpen(!patientPopoverOpen)} ...>
      Buscar paciente...
    </Button>
    {patientPopoverOpen && (
      <div className="border rounded-md mt-1">
        <Command>
          <CommandInput 
            autoFocus
            placeholder="Buscar contacto..."
            ...
          />
          <CommandList>...</CommandList>
        </Command>
      </div>
    )}
  </>
) : (
  <Popover ...>
    {/* código actual sin cambios */}
  </Popover>
)}
```

### Por qué esto funciona

- El Command se renderiza **dentro del DOM del Drawer**, no en un Portal
- `autoFocus` en un input que se monta como resultado de un tap directo del usuario **sí activa el teclado virtual** en iOS Safari
- No hay conflicto de foco con Vaul porque el input está en su árbol DOM

### Archivos a modificar
1. `src/components/agenda/QuickCreateSessionDialog.tsx` — bifurcar el selector de paciente para móvil/desktop


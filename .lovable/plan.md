

## Plan: Corregir selector de contacto en móvil (Popover dentro de Drawer)

### Problema
En móvil, los Drawer (Vaul) interceptan los eventos táctiles, impidiendo hacer focus en el input de búsqueda y scroll en la lista del selector de contacto.

### Solución
Añadir `modal={false}` al `Popover` y `z-[9999] pointer-events-auto` al `PopoverContent` en los 4 archivos afectados. Cambio mínimo (2 líneas por archivo):

### Archivos

1. **`src/components/agenda/PatientSelector.tsx`** — líneas 31 y 47
2. **`src/components/assessments/CreateAssessmentDialog.tsx`** — líneas 123 y 140
3. **`src/components/agenda/QuickCreateSessionDialog.tsx`** — líneas 760 y 785
4. **`src/components/payments/RecordPaymentDialog.tsx`** — líneas 329 y 351

### Cambio idéntico en cada archivo

```diff
- <Popover open={...} onOpenChange={...}>
+ <Popover open={...} onOpenChange={...} modal={false}>
```

```diff
- <PopoverContent className="w-[...] p-0" align="start">
+ <PopoverContent className="w-[...] p-0 z-[9999] pointer-events-auto" align="start">
```


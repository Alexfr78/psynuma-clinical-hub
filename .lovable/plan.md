

## Plan: Arreglar input de opciones del campo Selección

### Problema
Al escribir una coma en el input de opciones, el valor se recalcula inmediatamente: `split(',')` + `filter(Boolean)` elimina el string vacío después de la coma, y `join(', ')` vuelve a renderizar sin ella. La coma "desaparece".

### Solución
Guardar el texto raw del input en lugar de hacer round-trip `split → filter → join` en cada keystroke:

1. **En `FieldBuilder.tsx`**: cambiar el input de opciones para que almacene el valor crudo como string en el estado, y solo parsear a array al perder foco (`onBlur`) o al guardar.

Concretamente:
- Cambiar `value` del input a usar directamente el texto que escribe el usuario (no `options.join(', ')`)
- Usar un estado local `optionsText` por campo, inicializado desde `field.options.join(', ')`
- En `onChange`: actualizar solo el texto local
- En `onBlur`: parsear con `split(',').map(trim).filter(Boolean)` y llamar `updateField`

**Alternativa más simple**: almacenar el raw string directamente en `field.options` como texto intermedio, parseando solo en `onBlur`. Pero esto rompe el tipo. Mejor usar estado local.

### Archivo
- `src/components/autoregistros/FieldBuilder.tsx` — modificar solo la sección del input de opciones (líneas 135-144)


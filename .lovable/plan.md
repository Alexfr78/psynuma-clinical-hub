

## Plan: Drag & Drop para reordenar campos en FieldBuilder

### Enfoque
Implementar drag and drop nativo con la HTML Drag and Drop API (sin dependencias externas). Es suficiente para una lista vertical simple de cards y evita añadir librerías.

### Cambios en `src/components/autoregistros/FieldBuilder.tsx`

1. **Estado de drag**: Añadir `dragIndex` (campo siendo arrastrado) y `dragOverIndex` (posición destino).

2. **Eventos en cada Card**:
   - `draggable={true}`
   - `onDragStart` → guarda el índice origen
   - `onDragOver` → `preventDefault()` + guarda índice destino
   - `onDrop` → reordena el array moviendo el campo de `dragIndex` a `dragOverIndex`, recalcula `order`
   - `onDragEnd` → limpia estado

3. **Visual feedback**: Añadir un handle de arrastre (icono `GripVertical` de lucide) a la izquierda de cada card. Aplicar `opacity-50` al campo que se está arrastrando y un borde superior/inferior destacado en la posición destino.

4. **Mantener flechas**: Los botones ↑/↓ se mantienen como alternativa de accesibilidad.

### Archivo afectado
- `src/components/autoregistros/FieldBuilder.tsx` (solo este archivo)


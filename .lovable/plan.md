

## Plan: Implementar Y-BOCS-II (Escala de Obsesiones y Compulsiones de Yale-Brown)

### Descripción
La Y-BOCS-II es una escala de 10 ítems que evalúa la gravedad de obsesiones (ítems 1-5) y compulsiones (ítems 6-10). Cada ítem se puntúa de 0 a 5, con un rango total de 0-50.

### Archivos a crear

**1. `src/data/ybocs2-template.ts`**
- Template con 10 ítems, cada uno con 6 opciones (0-5), estilo BDI-2
- Ítems de obsesiones: Tiempo ocupado, Interferencia, Malestar, Resistencia, Control
- Ítems de compulsiones: Tiempo ocupado, Interferencia, Malestar, Resistencia, Control
- Scoring: `OBSESIONES` (ítems 1-5), `COMPULSIONES` (ítems 6-10), `TOTAL` (1-10)
- Cutoffs: Subclínico (0-7), Leve (8-15), Moderado (16-23), Grave (24-31), Extremo (32-50)
- `response_min: 0`, `response_max: 5`
- Función `getYBOCS2TemplateData()` para inserción en BD

**2. `src/components/assessments/YBOCS2ResultsView.tsx`**
- Vista de resultados especializada (patrón BDI2ResultsView)
- Puntuación total con barra de progreso y nivel de severidad
- Comparación obsesiones vs compulsiones (dos barras)
- Interpretación clínica por nivel
- Recomendaciones terapéuticas

### Archivos a modificar

**3. `src/components/assessments/AddTemplateDialog.tsx`**
- Añadir entrada YBOCS2 al array `PREDEFINED_TEMPLATES` con import de `getYBOCS2TemplateData`

**4. `src/pages/AssessmentResults.tsx`**
- Importar `YBOCS2ResultsView`
- Añadir detección `isYBOCS2 = templateCode === 'YBOCS2'`
- Renderizar vista especializada en el bloque condicional existente

**5. `src/pages/AssessmentPublic.tsx`**
- La Y-BOCS-II usa el mismo renderer BDI-2 (ítems con opciones radio), así que se añade detección `isYBOCS2 = template?.code === 'YBOCS2'` para usar `BDI2ItemRenderer`

### Estructura de los ítems (ejemplo ítem 1)
```typescript
{
  index: 1,
  label: 'Tiempo ocupado por obsesiones',
  text: 'Tiempo ocupado por pensamientos obsesivos',
  options: [
    { value: 0, text: 'Ningún tiempo dedicado a obsesiones.' },
    { value: 1, text: 'Menos de 1 hora/día o intrusiones ocasionales.' },
    { value: 2, text: 'De 1 a 3 horas/día o intrusiones frecuentes.' },
    { value: 3, text: 'De 3 a 8 horas/día o intrusiones muy frecuentes.' },
    { value: 4, text: 'Más de 8 horas/día o intrusiones casi constantes.' },
    { value: 5, text: 'Más de 8 horas/día o intrusiones constantes e incapacitantes.' },
  ],
}
```

### Sin cambios en backend
No se requieren migraciones SQL ni edge functions. El template se inserta usando la infraestructura existente (`createTemplate`).


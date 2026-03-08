

## Plan: Prerrellenar campos de fecha y hora con valores actuales

### Cambio

**`src/components/autoregistros/DynamicFormRenderer.tsx`** — Inicializar el estado `values` con valores por defecto para campos `date` y `time`:

- En el `useState` inicial, recorrer `fields` y para cada campo de tipo `date` asignar `new Date().toISOString().slice(0, 10)` (formato `YYYY-MM-DD`) y para tipo `time` asignar `new Date().toTimeString().slice(0, 5)` (formato `HH:MM`).
- Esto se calcula una vez al montar el componente usando una función inicializadora en `useState`.

```typescript
const [values, setValues] = useState<Record<string, any>>(() => {
  const defaults: Record<string, any> = {};
  for (const field of fields) {
    if (field.type === 'date') defaults[field.label] = new Date().toISOString().slice(0, 10);
    if (field.type === 'time') defaults[field.label] = new Date().toTimeString().slice(0, 5);
  }
  return defaults;
});
```

Un solo cambio en una línea. Sin cambios en backend ni otros archivos.


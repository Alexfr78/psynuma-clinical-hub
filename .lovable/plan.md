
# Fix: Pantalla en blanco al buscar disponibilidad en el portal del paciente

## Problema
La edge function `patient-portal-sessions` (action `get-availability`) devuelve los slots como objetos `{startTime, endTime}`, pero el componente `PortalBooking` los trata como strings simples (ej: `"09:00"`). Cuando React intenta renderizar un objeto como texto, lanza un error y la pantalla se queda en blanco.

Ademas, la respuesta no incluye `serviceDuration` ni `step`, que el frontend espera.

## Causa raiz
Linea 729 de `patient-portal-sessions/index.ts`:
```
JSON.stringify({ slots: uniqueSlots })
```
Donde `uniqueSlots` es `[{startTime: "09:00", endTime: "10:00"}, ...]`

Pero `PortalBooking.tsx` linea 579 renderiza cada slot directamente como texto: `{slot}` esperando un string.

## Solucion

### Archivo a modificar: `supabase/functions/patient-portal-sessions/index.ts`

Cambiar la respuesta del action `get-availability` (linea ~729) para:
1. Devolver `slots` como array de strings (solo `startTime`): `uniqueSlots.map(s => s.startTime)`
2. Incluir `serviceDuration` y `step` en la respuesta

Cambio concreto:
```typescript
// ANTES
return new Response(
  JSON.stringify({ slots: uniqueSlots }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

// DESPUES
return new Response(
  JSON.stringify({ 
    slots: uniqueSlots.map(s => s.startTime),
    serviceDuration,
    step: slotDuration
  }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### Despliegue
- Redesplegar `patient-portal-sessions`

## Impacto
- Corrige la pantalla en blanco al navegar semanas con disponibilidad
- No afecta ninguna otra funcionalidad
- Un solo cambio de 3 lineas en un archivo

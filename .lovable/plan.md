

## Plan: Optimización de disponibilidad con scoring anti-fragmentación

### Problema actual

1. **`get-availability` (public-booking)**: Para sesiones de 60 min usa `step=60`, genera slots a las 09:00, 10:00, 11:00... Luego un segundo bloque añade slots al final de sesiones existentes (ej: 09:30 si hay sesión 08:30-09:30). Esto reintroduce fragmentación.

2. **`get-availability-month` (public-booking)**: Usa `step=30` bruto para contar slots disponibles. Inconsistente con `get-availability` que usa `step=60`.

3. **`patient-portal-sessions`**: Mismo problema — usa `slotDuration` (30 min) como step sin scoring.

4. **No hay scoring**: Ningún endpoint evalúa si un slot deja huecos residuales no vendibles.

### Solución: Lógica compartida de ventanas libres + scoring

#### Archivo nuevo: `supabase/functions/_shared/availability.ts`

Helpers reutilizables:

```text
┌─────────────────────────────────────────────────┐
│  buildFreeWindows(intersections, sessions, events)  │
│  → [{start, end}]  ventanas libres continuas        │
├─────────────────────────────────────────────────┤
│  scoreSlot(slotStart, slotEnd, freeWindow,          │
│            minPublicDuration)                        │
│  → { score, isOptimal }                             │
├─────────────────────────────────────────────────┤
│  generateScoredSlots(freeWindows, duration, step,   │
│                      minPublicDuration)              │
│  → [{startTime, endTime, score, isOptimal}]         │
├─────────────────────────────────────────────────┤
│  filterOptimalSlots(scoredSlots)                     │
│  → slots finales (oculta subóptimos si hay óptimos) │
├─────────────────────────────────────────────────┤
│  countOptimalSlots(freeWindows, duration, step,      │
│                    minPublicDuration)                 │
│  → número (para conteo mensual)                     │
└─────────────────────────────────────────────────┘
```

**Lógica de `buildFreeWindows`:**
1. Partir de cada intersección profesional×ubicación
2. Restar bloques ocupados (sesiones + eventos calendario) cortando las ventanas
3. Resultado: lista de `{start, end}` continuas sin solapamiento

**Lógica de `scoreSlot`:**
- Dentro de la ventana libre donde cae el slot, calcular:
  - `leftGap = slotStart - freeWindow.start`
  - `rightGap = freeWindow.end - slotEnd`
- Si `leftGap > 0` y `leftGap < minPublicDuration` → penalización fuerte (-100)
- Si `rightGap > 0` y `rightGap < minPublicDuration` → penalización fuerte (-100)
- Si `leftGap === 0` → recompensa (+20, pegado al inicio)
- Si `rightGap === 0` → recompensa (+20, pegado al final)
- Si slot consume exactamente la ventana → recompensa extra (+30)
- Bonus si `slotStart % 60 === 0` (hora en punto) → +5
- `isOptimal = score >= 0`

**`minPublicDuration`:** la duración mínima entre todos los tipos de sesión pública activos del centro. Se consulta una vez y se pasa a los helpers. Un hueco residual es "no vendible" si es menor que esta duración.

**`filterOptimalSlots`:** Si existen slots con `isOptimal=true`, devolver solo esos. Si no existen, devolver todos ordenados por score desc.

**`generateScoredSlots`:** Genera candidatos con step fino (el `reschedule_slot_duration` o 15 min), los puntúa, y aplica `filterOptimalSlots`.

#### Cambios en `supabase/functions/public-booking/index.ts`

**`get-availability` (líneas 430-658):**
- Importar helpers de `_shared/availability.ts`
- Consultar `minPublicDuration` (SELECT MIN(duration_minutes) FROM session_types WHERE center_id=X AND is_public AND is_active)
- Construir `freeWindows` a partir de intersecciones prof×loc menos sesiones y eventos
- Llamar `generateScoredSlots(freeWindows, serviceDuration, step, minPublicDuration)`
- Devolver `{ slots: [{startTime, endTime, isOptimal}], serviceDuration }`
- Eliminar el bloque "Fill gaps created by existing sessions" (líneas 632-646)

**`get-availability-month` (líneas 660-906):**
- Usar mismos helpers: `buildFreeWindows` + `countOptimalSlots` para cada día
- Consultar `minPublicDuration` una vez al inicio
- El conteo será coherente con `get-availability`

#### Cambios en `supabase/functions/patient-portal-sessions/index.ts`

**`get-availability` (líneas 1037-1199) y `get-month-availability` (líneas 862-1035):**
- Importar y usar los mismos helpers de `_shared/availability.ts`
- Mismo patrón: buildFreeWindows → generateScoredSlots / countOptimalSlots

#### Cambios en frontend

**`src/hooks/usePublicBooking.tsx`:**
- Actualizar tipo `Slot` para incluir `isOptimal?: boolean`

**`src/pages/PublicBooking.tsx`:**
- Mostrar slots subóptimos con estilo atenuado (borde gris punteado, opacidad reducida) si los hay
- Los slots óptimos se muestran con estilo normal
- Si solo hay subóptimos, mostrarlos sin distinción visual

**`src/components/portal/PortalBooking.tsx`:**
- Mismo tratamiento visual si el endpoint devuelve `isOptimal`

### Archivos afectados

| Archivo | Acción |
|---|---|
| `supabase/functions/_shared/availability.ts` | **Crear** — helpers compartidos |
| `supabase/functions/public-booking/index.ts` | Refactorizar get-availability y get-availability-month |
| `supabase/functions/patient-portal-sessions/index.ts` | Refactorizar get-availability y get-month-availability |
| `src/hooks/usePublicBooking.tsx` | Añadir `isOptimal` al tipo Slot |
| `src/pages/PublicBooking.tsx` | UI: slots subóptimos atenuados |
| `src/components/portal/PortalBooking.tsx` | UI: slots subóptimos atenuados |

### Ejemplo concreto

Profesional disponible 09:00-21:00, sesión existente 10:30-11:30, servicio solicitado 60 min, `minPublicDuration=45`:

```text
Ventanas libres: [09:00-10:30] [11:30-21:00]

Ventana [09:00-10:30] (90 min):
  09:00 → leftGap=0 rightGap=30 → rightGap<45 → penalizado SI solo hay ese slot
  09:30 → leftGap=30 rightGap=0 → leftGap<45 → penalizado
  → Mejor: 09:00 (pegado al borde, y 09:30 deja hueco de 30 a la izq)
  → Pero ambos dejan huecos no vendibles. Si no hay mejor opción, mostrar 09:00 (score más alto por borde)

Ventana [11:30-21:00] (570 min):
  11:30 → leftGap=0, rightGap=510 → óptimo (+20 borde)
  12:00 → leftGap=30, rightGap=480 → leftGap<45 → penalizado
  12:30 → leftGap=60, rightGap=450 → leftGap≥45 → OK pero no borde
  ...
  → Se muestran: 11:30, 12:30, 13:30... (pegados o sin huecos no vendibles)
  → Se ocultan: 12:00, 13:00... (dejan 30 min no vendibles tras 11:30)
```

### No se añaden columnas de configuración a la BD

Los flags `hide_suboptimal_slots`, `prefer_edge_packing` etc. se manejan como constantes en el helper por ahora, simplificando la implementación. Se pueden externalizar a `centers` en una iteración futura si es necesario.


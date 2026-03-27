
Objetivo: corregir por qué en modo “análisis directo” el botón termina y el diálogo vuelve al estado inicial sin mostrar informes.

1. Corregir la causa real en la Edge Function
- Revisaré `supabase/functions/analyze-session-transcription/index.ts` para asegurar que el modo `single` se detecta de forma fiable.
- Ahora mismo los logs demuestran que está entrando en la rama normal de `Layer 1` en vez de la rama `single`, aunque el centro tiene `ai_analysis_mode = 'single'`.
- Haré el ajuste para normalizar el valor (`trim`/lowercase) y añadir logs explícitos del `analysisMode` cargado para evitar falsos positivos por espacios, mayúsculas o datos inconsistentes.
- También endureceré la respuesta del modo directo para que siempre devuelva `mode: 'single'` y las claves `clinical` y `patient` en el payload top-level.

2. Hacer el parsing del cliente más tolerante
- En `src/hooks/useTranscriptionAnalysis.tsx` reforzaré `parseSingleModeReports` para aceptar más formatos de respuesta sin romper el flujo:
  - `clinical`/`patient` en top-level
  - JSON serializado en `content`
  - bloques markdown con texto extra antes o después
- Si el centro está en `single` pero llega una respuesta no parseable, dejaré trazas más claras para distinguir si falló el backend o el parsing.

3. Evitar que la UI “vuelva al inicio” cuando el backend responde en formato inesperado
- En `src/components/agenda/TranscriptionAnalysisDialog.tsx` mantendré visible un estado de error útil cuando falle el parseo del modo directo, en vez de dejar solo la pantalla inicial.
- Así el profesional verá que la generación falló por formato de respuesta y no parecerá que “no ha pasado nada”.

4. Verificar consistencia entre configuración y ejecución
- Revisaré el flujo de `useCenter` / `AISettingsSection` / diálogo para asegurar que todos leen el mismo valor de `ai_analysis_mode` y no hay discrepancias entre cache del cliente y configuración en backend.
- Si detecto dependencia frágil del estado local del centro, propondré que la Edge Function use exclusivamente la configuración almacenada del centro, que ya es la fuente de verdad.

5. Validación final
- Comprobaré que el flujo esperado quede así:
  - pulsar “Generar informes”
  - la función entra en modo `single`
  - devuelve ambos informes
  - el hook rellena `clinicalReport` y `patientReport`
  - el modal muestra ambos bloques y el botón “Nuevo análisis”
- También revisaré que el modo de 3 capas siga intacto.

Detalles técnicos encontrados
- El frontend sí está pasando `isOpen: open` al hook.
- El diálogo sí oculta la UI inicial cuando existen `clinicalReport` o `patientReport`.
- El fallo observado está antes: la función `analyze-session-transcription` está registrando `Layer 1 completed` en lugar de ejecutar la rama `Single mode`.
- La base de datos confirma que el centro actual tiene `ai_analysis_mode = 'single'`, así que el problema es de ejecución/normalización en backend, no de configuración guardada.

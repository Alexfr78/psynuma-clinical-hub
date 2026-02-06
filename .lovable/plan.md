
# Plan: Implementar EMO - Entrevista de Regulación Emocional

## Resumen

Se implementara la plantilla del EMO (Entrevista sobre la Historia de la Regulacion Emocional) desarrollada por Anabel Gonzalez. Este instrumento evalua patrones de regulacion emocional, historia de figuras reguladoras y calidad de las relaciones de apego temprano. Es una entrevista semi-estructurada con formato mixto: preguntas abiertas cualitativas, listas de verificacion y tablas de evaluacion.

## Estructura del EMO

La entrevista se organiza en tres secciones principales:

### Seccion 1: Regulacion Emocional Actual
- Descripcion general del modo de regular emociones (abierta)
- Dificultad para sentir emociones (abierta)
- Seleccion de emociones problematicas: Aburrimiento, Admiracion, Apatia, Asco, Calma, Cansancio, Carino, Celos, Disfrute, Esfuerzo, Euforia, Gratitud, Paciencia, Incertidumbre, Miedo, Optimismo, Rechazo, Satisfaccion, Enfado, Envidia, Soledad, Tristeza, Verguenza, Dolor, Seguridad
- Checklist de tendencias regulatorias (11 opciones):
  - Evito sentir algunas cosas
  - Tiendo a suprimir o anular determinadas emociones
  - Algunas de mis emociones suelen desbordarse
  - Trato de controlar mis emociones todo lo que puedo
  - A veces me vienen emociones que no me parecen mias
  - Quisiera sentir mas de lo que siento
  - Tiendo a contagiarme de las emociones de los demas
  - Mis emociones estan siempre a flor de piel
  - Mis emociones son demasiado intensas
  - Soy poco emocional, o eso me dicen
  - Me enfado conmigo mismo por sentir determinadas emociones
- Tendencias adicionales (6 opciones):
  - A veces me averguenzo de lo que puedo llegar a sentir
  - Puede cambiar de un momento a otro lo que siento
  - En general no se muy bien lo que siento
  - Siento cosas que no deberia de sentir
  - Me siento como anestesiado a nivel emocional
  - Le doy vueltas y vueltas a como me siento
- Origen temporal (abierta)
- Empeoramiento (abierta)

### Seccion 2: Figuras Reguladoras
- Personas con las que se crio (abierta)
- Cambios en convivencia (abierta)
- Figuras importantes fuera de familia (abierta)
- Cuidadores contratados (abierta)
- Internados o instituciones (abierta)
- Adopcion o acogida (abierta)
- Figuras relevantes adicionales (abierta)
- Figuras con influencia positiva (abierta)
- Figuras con influencia negativa (abierta)
- Figuras ausentes emocionalmente (abierta)
- 10 momentos de regulacion compartida (lista abierta)

### Seccion 3: Evaluacion por Figura (repetible)
- Datos de la figura (nombre, relacion)
- Primer recuerdo con esa persona (abierta)
- Expresion tipica de su cara (abierta)
- Relacion actual (abierta)
- Reaccion ante perdida (abierta)
- 5 adjetivos con ejemplos (tabla)
- Reaccion ante malestar del paciente (abierta)
- Reaccion ante exitos/fracasos (abierta)
- Ayuda en situaciones importantes (abierta)
- Sentimientos generados: Entendido, Rechazado, Aceptado, Atemorizado, Valorado, Inseguro, Invisible, Avergonzado, Especial, Humillado, Importante, Traicionado, Inutil, Ridiculo, Protegido, Apoyado, Culpable, Seguro
- Tabla emociones x frecuencia/aceptacion
- Emocion que la figura llevaba peor (abierta)
- Emocion que llevaba peor ver en el paciente (abierta)
- Reacciones desadaptativas (checklist)
- Ayuda fisica (abierta)
- Ayuda emocional con ejemplo (abierta)
- Comentarios adicionales (abierta)

## Propuesta de Scoring y Analisis

Dado que el EMO es mayoritariamente cualitativo, la estrategia de scoring se basara en:

### Indicadores Cuantitativos
1. **Numero de emociones problematicas** (de 25 posibles)
2. **Numero de tendencias disfuncionales** (de 17 posibles)
3. **Patron de tendencias** agrupado en categorias:
   - **Hipoactivacion**: Evito sentir, Suprimo emociones, Anestesiado, Poco emocional
   - **Hiperactivacion**: Desbordamiento, A flor de piel, Demasiado intensas, Contagio emocional
   - **Disregulacion**: Emociones que no parecen mias, Cambios de un momento a otro, No se lo que siento
   - **Autocritica**: Me enfado conmigo, Me averguenzo, Siento cosas que no deberia
   - **Rumiacion**: Le doy vueltas y vueltas
   - **Control excesivo**: Trato de controlar todo lo que puedo
4. **Numero de momentos regulatorios positivos** identificados (de 10)
5. **Sentimientos negativos por figura** (conteo de sentimientos como Rechazado, Humillado, Traicionado, etc.)
6. **Sentimientos positivos por figura** (conteo de Entendido, Aceptado, Valorado, etc.)
7. **Reacciones parentales desadaptativas** (conteo de las 10 opciones)

### Analisis Cualitativo con IA
Se implementara un analisis asistido por IA (Lovable AI) que generara:
1. **Perfil de regulacion emocional**: identificando el patron predominante (hipoactivacion, hiperactivacion, mixto)
2. **Calidad del apego temprano**: basado en las respuestas sobre figuras reguladoras
3. **Recursos de regulacion**: identificando fortalezas y momentos de regulacion positiva
4. **Areas de intervencion prioritarias**: recomendaciones clinicas basadas en los patrones detectados
5. **Hipotesis sobre origen**: conexion entre historia relacional y patron actual

## Archivos a Crear/Modificar

### 1. Plantilla de datos
**Archivo:** `src/data/emo-template.ts`

Contendra:
- Definicion de tipos TypeScript para EMO
- Lista de emociones problematicas
- Lista de tendencias regulatorias con agrupacion por categoria
- Lista de sentimientos generados por figuras
- Lista de reacciones parentales desadaptativas
- Estructura de items de la entrevista
- Configuracion de scoring
- Funcion `getEMOTemplateData()` para insercion en BD

### 2. Componente de visualizacion de resultados
**Archivo:** `src/components/assessments/EMOResultsView.tsx`

Mostrara:
- Resumen de patrones de regulacion detectados
- Grafico radar con las 6 categorias de tendencias
- Listado de emociones problematicas seleccionadas
- Momentos de regulacion positiva identificados
- Resumen por cada figura evaluada:
  - Balance sentimientos positivos/negativos
  - Reacciones desadaptativas identificadas
- Panel de analisis con IA (si se ha generado)
- Respuestas abiertas organizadas por seccion

### 3. Actualizacion del dialogo de plantillas
**Archivo:** `src/components/assessments/AddTemplateDialog.tsx`

Agregar EMO a la lista de plantillas predefinidas disponibles.

### 4. Actualizacion de utilidades de evaluacion
**Archivo:** `src/lib/assessment-utils.ts`

Agregar:
- Constantes y labels para factores EMO
- Orden de factores para visualizacion
- Funciones de utilidad especificas

### 5. Actualizacion de logica de scoring en backend
**Archivo:** `supabase/functions/submit-assessment-response/index.ts`

Agregar bloque de scoring especifico para EMO:
- Conteo de emociones problematicas
- Conteo y categorizacion de tendencias
- Generacion de factor_scores con indicadores cuantitativos
- Flags para patrones criticos

### 6. Actualizacion de generacion de PDF
**Archivo:** `supabase/functions/generate-assessment-pdf/index.ts`

Agregar seccion especifica para EMO que incluya:
- Perfil de regulacion emocional
- Respuestas cualitativas organizadas
- Tablas de figuras reguladoras
- Interpretacion clinica

### 7. Edge Function para analisis con IA
**Archivo:** `supabase/functions/interpret-emo-results/index.ts` (nuevo)

Utilizara Lovable AI para generar:
- Interpretacion clinica del perfil
- Hipotesis sobre origen de patrones
- Recomendaciones de intervencion

### 8. Actualizacion de pagina de resultados
**Archivo:** `src/pages/AssessmentResults.tsx`

Agregar condicional para renderizar `EMOResultsView` cuando el template sea EMO.

## Justificacion del Modelo de Analisis

### Por que este enfoque mixto cuanti-cualitativo

1. **Respeta la naturaleza del instrumento**: El EMO fue disenado como entrevista semi-estructurada, no como cuestionario psicometrico. Forzar un scoring puramente cuantitativo distorsionaria su proposito clinico.

2. **Indicadores cuantitativos utiles**:
   - Permiten comparaciones entre evaluaciones del mismo paciente
   - Facilitan la deteccion rapida de patrones criticos
   - Proporcionan metricas objetivas para seguimiento

3. **Categorizacion teoricamente fundamentada**: La agrupacion de tendencias en Hipoactivacion/Hiperactivacion/Disregulacion sigue los modelos de ventana de tolerancia de Ogden y la teoria polivagal de Porges.

4. **IA como asistente, no como sustituto**: El analisis con IA genera hipotesis e interpretaciones que el clinico debe validar, no sustituye el juicio profesional.

### Limitaciones a considerar

- No existen baremos poblacionales para el EMO
- Los puntos de corte seran orientativos, no normativos
- El analisis cualitativo requiere revision clinica obligatoria

## Dependencias Tecnicas

- Lovable AI (ya disponible) para analisis cualitativo
- Componentes existentes de graficos (Recharts)
- Sistema de templates existente
- Edge Functions existentes como modelo

## Tiempo Estimado de Implementacion

La implementacion completa requerira la creacion de 2 archivos nuevos y la modificacion de 6 archivos existentes.

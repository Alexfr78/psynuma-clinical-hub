---
name: registrar-cambio
description: Apunta en el historial de versiones de Psycma (app_change_log) lo que acabamos de terminar, y publica una versión cuando el usuario lo pide. Úsalo al cerrar cualquier tarea que cambie algo en la app (tras el commit) y cuando el usuario diga "publica versión", "saca versión" o similar.
argument-hint: "[qué se registra | publicar]"
---

# Historial de versiones de Psycma

Las novedades viven en dos tablas de la base de producción:
- `app_change_log`: un cambio por fila. `status` = `pending` (sin versión) → `included` (dentro de una versión).
- `app_versions`: la versión (`version_code` tipo `3.3.4`). Al publicarla, todos los usuarios
  reciben el aviso de novedades (ventana si `announce_mode='highlight'`, aviso breve si `'normal'`).

Todo se hace con `mcp__lovable__query_database` (sin créditos de Lovable):
- Proyecto: `1c3f38c6-26bb-400e-b9a4-2880eee465b6`
- Autor de todo: Alejandro, `feb134c7-1065-4085-867c-408f0ff68153` (único dueño de la plataforma).
  Hay que ponerlo a mano en `created_by`: desde `query_database` no hay sesión, así que el trigger
  `app_change_log_guard_requests` no lo rellena.

Lo pedido: $ARGUMENTS

## A. Registrar un cambio (al terminar una tarea)

1. Mira qué se hizo (la conversación y `git log`/`git diff` del trabajo). Si son varios cambios
   independientes para el usuario, una fila por cada uno; si es uno solo con piezas técnicas, una fila.
2. Antes de crear nada, consulta los pendientes y los de la última versión para no duplicar:
   ```sql
   select id, title, status, created_at from app_change_log
   where status = 'pending' or created_at > now() - interval '14 days'
   order by created_at desc;
   ```
   Si ya existe uno igual, actualízalo en vez de crear otro.
3. Rellena los campos:
   - `title`: corto, en español, ≤ 200 caracteres. Ej.: «Bloqueo de pacientes».
   - `description`: lo técnico para Alejandro (qué cambió y dónde), ≤ 2000.
   - `module`: uno de `agenda`, `pacientes`, `facturación`, `evaluaciones`, `autoregistros`,
     `consentimientos`, `configuración`, `portal`, `verifactu`, `seguridad`, `otros`.
   - `change_type`: `feature`, `improvement`, `fix`, `technical`, `legal`, `security` o `ui`.
   - `is_user_facing`: `false` para `technical` y `security` y para todo lo que el usuario no nota.
   - `user_summary`: solo si `is_user_facing`. Lo que verá el psicólogo: 1–2 frases, ≤ 500,
     tuteando, qué puede hacer ahora y dónde. Sin jerga ni nombres de tablas.
   - `affects_verifactu`: `true` solo si toca facturación Verifactu (sellado, cadena, AEAT, QR).
4. Enséñale al usuario el título, el tipo y el `user_summary` en una lista corta y **espera su OK**
   (puede corregir el texto). Luego inserta:
   ```sql
   insert into app_change_log
     (title, description, module, change_type, affects_verifactu, is_user_facing, user_summary, status, created_by)
   values (..., 'pending', 'feb134c7-1065-4085-867c-408f0ff68153')
   returning id, title;
   ```
5. No registres: cambios solo de herramientas internas (`.claude/`, tests, CLAUDE.md), ni cosas
   que aún no estén en producción salvo que el usuario lo pida.

## B. Publicar una versión (solo cuando el usuario lo pide)

Publicar avisa a **todos** los usuarios: pide confirmación explícita cada vez, aunque ya se
haya publicado otra antes en la conversación.

1. Saca los pendientes y la versión actual:
   ```sql
   select id, title, change_type, is_user_facing, user_summary, affects_verifactu
   from app_change_log where status = 'pending' order by created_at;
   select version_code from app_versions where is_current;
   ```
2. Propón:
   - Número: sube el último dígito (`3.3.4` → `3.3.5`). Sube el del medio (`3.4.0`) solo si hay
     una función nueva grande y el usuario está de acuerdo.
   - `announce_mode`: `normal` por defecto; `highlight` solo si hay un `feature` importante.
   - Qué pendientes entran (por defecto todos). Avisa si alguno visible no tiene `user_summary`
     (rellénalo antes) o si dos parecen duplicados.
   - `applies_to_verifactu = true` si algún cambio tiene `affects_verifactu`.
3. Con el OK, en **una sola llamada** (es una transacción):
   ```sql
   with v as (
     insert into app_versions
       (version_code, description, applies_to_verifactu, announce_mode, status, published_at, is_current, created_by)
     values ('3.3.5', null, false, 'normal', 'published', now(), true, 'feb134c7-1065-4085-867c-408f0ff68153')
     returning id
   )
   update app_change_log set version_id = (select id from v), status = 'included'
   where id in (...ids...)
   returning title;
   ```
   El trigger `enforce_single_current_version` quita `is_current` a la anterior.
4. Comprueba: `select version_code, status, is_current, published_at from app_versions order by created_at desc limit 2;`
5. Si `applies_to_verifactu`: recuérdale que la sincronización con Verifactu (versión del software
   de cada centro) se hace a mano en Configuración → Sistema; no la hagas tú.

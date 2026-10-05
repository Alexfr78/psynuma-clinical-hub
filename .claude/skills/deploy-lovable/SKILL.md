---
name: deploy-lovable
description: Despliega a producción los cambios de Psycma a través de Lovable (migraciones, edge functions y publicación del frontend), gastando los mínimos créditos y verificando de verdad que el cambio está publicado.
disable-model-invocation: true
argument-hint: "[qué se despliega, opcional]"
---

# Desplegar Psycma vía Lovable

Psycma corre en **Lovable Cloud** (Supabase gestionado por Lovable, Zúrich). No hay CLI ni token de
Supabase: las migraciones se aplican con `mcp__lovable__query_database` y las edge functions y la
publicación las hace el agente de Lovable. Cada `send_message` gasta créditos del usuario.

- Proyecto Lovable: `1c3f38c6-26bb-400e-b9a4-2880eee465b6`
- Producción: `https://psycma.lovable.app` (más el dominio propio)
- Funciones: `https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/<nombre>`

Lo que se despliega: $ARGUMENTS (si viene vacío, dedúcelo del diff desde el último despliegue y confírmalo con el usuario).

## 1. Inventario

Lista exactamente qué sale, en tres grupos:
- **Migraciones** nuevas en `supabase/migrations/` (y si ya están aplicadas o no).
- **Edge functions** cambiadas: `git diff --name-only <base>..HEAD -- supabase/functions/`.
  Un cambio en `_shared/` obliga a redesplegar **todas** las funciones que lo importan
  (búscalas con Grep sobre el nombre del módulo).
- **Frontend**: cualquier cambio en `src/`, `public/`, `index.html` o `vite.config.ts`.

Enséñale el inventario al usuario antes de seguir.

## 2. Verificar en local (sin Lovable)

- `npx tsc --noEmit -p tsconfig.app.json`
- `npm run lint`
- `npm run test`
- Si hay cambios en funciones, migraciones, rutas públicas, consentimiento o pagos: lanza el
  subagente `clinical-data-reviewer`; lo CRÍTICO/ALTO se arregla antes de seguir.

Si algo falla, para y arréglalo: no se despliega nada roto.

## 3. Commit y push a `main`

Lovable solo observa `main` y además commitea en segundo plano.
- `git fetch` y comprueba ahead/behind. Si `origin/main` avanzó: `git pull --rebase`.
- Commit y push. Si `main` diverge, Lovable empuja sus commits a `origin/lovable-sync`: revísalo.
- Comprueba con `mcp__lovable__get_project` que `latest_commit_sha` coincide con tu HEAD.

## 4. Migraciones (sin créditos)

Para cada migración pendiente, con `mcp__lovable__query_database`:
1. Consulta el estado antes (`to_regclass`, `information_schema`, `pg_policies`, `cron.job`) para no
   aplicar dos veces.
2. Aplica el SQL completo dentro de `BEGIN; ... COMMIT;`.
3. Verifica después: tablas, columnas, triggers, policies, crons.

Limitaciones conocidas:
- `INSERT INTO storage.buckets` no funciona por esta vía: pídeselo a Lovable en el mensaje del paso 5.
- `current_setting('app.settings.functions_url')` no existe aquí: los crons deben usar la URL literal.

## 5. Un único mensaje a Lovable

Agrupa en **una sola** llamada a `mcp__lovable__send_message` todo lo que solo Lovable puede hacer:
- desplegar la lista exacta de edge functions;
- regenerar `src/integrations/supabase/types.ts` si hubo migraciones (y avisar de que no quite tipos
  de migraciones que aún no estén aplicadas);
- crear buckets de Storage si los hay;
- publicar el frontend si hay cambios de frontend.

Pídele que **no toque código** salvo `types.ts`. Si la llamada da timeout (>300 s), **no la repitas**:
Lovable sigue trabajando. Consulta `mcp__lovable__list_messages` (guarda la salida a archivo y léela
con `node -e`) hasta ver la respuesta.

Si solo hay frontend, en vez del mensaje usa `mcp__lovable__deploy_project`.

## 6. Verificar que está publicado de verdad

`deploy_project` puede devolver `pending` y no propagar. No des nada por hecho:

- **Frontend:** `curl -sL --compressed https://psycma.lovable.app/`, saca el `assets/index-*.js` y la
  lista de fragmentos (`Agenda-*.js`, `PatientDetail-*.js`…), y busca una firma del cambio que
  sobreviva a la minificación (un literal de texto en español, no nombres de función propios).
  Si no aparece, vuelve a llamar a `deploy_project` y comprueba otra vez.
- **Edge functions:** llama a la función (p. ej. sin auth debe responder 401 si exige auth) o revisa
  que Lovable confirmó el despliegue de cada una.
- **Migraciones:** ya verificadas en el paso 4.
- Haz `git pull` para traer el commit de Lovable con `types.ts` y revisa su diff.

## 7. Informe final

Di qué salió, cómo se verificó cada parte y qué quedó pendiente. Recuerda que la PWA instalada en el
móvil puede seguir con la versión vieja hasta cerrarla del todo y reabrirla.

---
name: psycma-conventions
description: Convenciones de código de Psycma (frontend React/TanStack Query y edge functions Deno). Consúltala antes de escribir o modificar hooks de datos, páginas, listados, llamadas a edge functions o funciones en supabase/functions/.
user-invocable: false
---

# Convenciones de Psycma

## Datos en el frontend

- **Nada de Supabase directo en páginas o componentes.** Cada dominio tiene su hook en `src/hooks/`
  (`usePatients`, `useInvoices`, `useSessions`…) con `useQuery`/`useMutation`. Si no existe, se crea
  el hook; no se mete la consulta en el componente.
- **Query keys solo desde el catálogo `qk`** de `src/lib/query-keys.ts`. Nunca arrays literales
  (`['invoices', ...]`). Para invalidar, usa las ramas `qk.<dominio>.all` / funciones del catálogo.
  Si falta una clave, añádela al catálogo (y a `src/lib/__tests__/query-keys.test.ts` si aplica).
- **Todo filtrado por centro.** Las consultas llevan el `center_id` del perfil (`useAuth().profile`).
- **Listados paginados** con `src/lib/pagination.ts` (`PAGE_SIZE_OPTIONS` 10/50/100,
  `DEFAULT_PAGE_SIZE` 50, `pageRange`, `totalPages`). La búsqueda en Facturas/Cobros/Auditoría usa
  el campo calculado `search_text(tabla)`.
- **Más de 1000 filas** (límite de PostgREST): `fetchAllRows` / `fetchInChunks` de
  `src/lib/fetch-all-rows.ts`, que reexporta `_shared/fetchAllRows.ts`. No reimplementar bucles.

## Llamadas a edge functions

- Errores de `supabase.functions.invoke`: `describeEdgeFunctionError(error, fallback)` de
  `src/lib/edge-function-error.ts`. supabase-js oculta el cuerpo de la respuesta; sin esto el usuario
  solo ve "non-2xx status code".
- Mensajes al usuario con `sonner` (`toast.error`/`toast.success`), en español.

## Rutas y páginas

- Rutas en `src/App.tsx` con `lazyPage(() => import(...))` de `src/lib/lazy-page.ts`, nunca
  `import` directo de páginas.
- Ruta pública nueva con pago o acción irreversible → añadirla a `navigateFallbackDenylist` en
  `vite.config.ts`.
- UI siempre en español de España. Componentes base de `@/components/ui/` (shadcn). Imports con `@/`.

## Lógica compartida frontend ↔ edge functions

- `src/lib/availability-core.ts` es la fuente; `_shared/availability-core.ts` se genera con
  `npm run sync:availability-core` (un hook lo hace solo al editar). No editar la copia.
- Consentimiento: `src/lib/consent-*.ts` ↔ `_shared/consent.ts`, y `consent-identity.ts` ↔
  `_shared/consentIdentity.ts`. Se mantienen a mano: un cambio en un lado va al otro.
- Lógica pura nueva que necesiten ambos: escribirla en `_shared/` sin dependencias de Deno y
  reexportarla desde `src/lib/` (patrón de `fetch-all-rows.ts`).

## Edge functions (Deno)

- Funciones con `verify_jwt = false` en `supabase/config.toml` deben autenticar al llamante:
  `resolveCaller` (`_shared/requireCaller.ts`) o `hasAuthenticatedJWT` (`_shared/authGuard.ts`),
  o el token/HMAC/OTP propio de la ruta pública. Con service role, filtrar siempre por centro.
- Endpoints públicos: `checkIpRateLimit` (`_shared/rateLimiter.ts`). CORS con `getCorsHeaders`.
- Accesos a datos clínicos: `logAuditEvent` (`_shared/auditLogger.ts`).
- Secretos solo por `Deno.env`. Logs con IDs, nunca datos de pacientes.
- Crons en migraciones: URL literal de funciones, no `current_setting('app.settings.functions_url')`.

## Base de datos

- `src/integrations/supabase/types.ts` no se edita a mano: lo regenera Lovable.
- Tablas nuevas con RLS por `center_id`. Migraciones se aplican con `mcp__lovable__query_database`
  (ver la skill `/deploy-lovable`).

## Tests y verificación

- Lógica pura en `src/lib/` con test en `src/lib/__tests__/` (vitest). Antes de dar algo por hecho:
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm run test`.

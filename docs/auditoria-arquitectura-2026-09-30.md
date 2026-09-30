# Auditoría de arquitectura — Psycma (30-sep-2026)

Revisión hecha desde fuera, como alguien que llega nuevo al código. Todo lo que aparece aquí
sale del código del repositorio y de medirlo (build, grep, tests). Nada se ha supuesto.

---

## 1. Qué hay

| Medida | Valor |
|---|---|
| Frontend (`src/`) | ~134.000 líneas TS/TSX, 44 páginas, 96 hooks, 55 módulos en `lib/` |
| Backend (`supabase/functions/`) | ~52.000 líneas, 107 funciones Deno + `_shared/` (8.800 líneas) |
| Tests | 43 ficheros, 375 tests (vitest), casi todo en `src/lib/__tests__/` |
| TypeScript | `strict: false`, `strictNullChecks: false`, `noImplicitAny: false` |
| Bundle antes de esta revisión | **un solo chunk de 3,8 MB (1.011 KB gzip)** |

### 1.1 Mapa de capas

```
┌────────────────────────── Navegador (React 19 SPA + PWA) ─────────────────────────┐
│  App.tsx ─ Router ─┬─ Rutas públicas (paciente, sin sesión: token en la URL)       │
│                    └─ ProtectedRoute → AppLayout → Página                          │
│                                                                                    │
│  Página / Diálogo  ──►  hook de dominio (useX, TanStack Query)  ──► supabase-js    │
│        │                                                               │           │
│        └── (48 componentes llaman a supabase directamente) ───────────┘           │
└──────────────────────────────┬──────────────────────────┬──────────────────────────┘
                               │ PostgREST (+RLS)         │ functions.invoke (159 sitios)
                               ▼                          ▼
                   ┌────────────────────┐     ┌─────────────────────────────────────┐
                   │ Postgres (Lovable  │◄────│ Edge functions (Deno, service role) │
                   │ Cloud, Zúrich)     │     │  · 50 con verify_jwt = false        │
                   │ RLS por center_id  │     │  · pg_cron → funciones (CRON_SECRET)│
                   │ triggers, RPC      │     │  · webhooks: Stripe, Google, Wasender│
                   └────────────────────┘     └──────────────┬──────────────────────┘
                                                             ▼
                          Stripe · Google Calendar/Drive · Zoom · Resend · WasenderAPI
                          · OpenAI (IA/transcripción) · AEAT (Verifactu)
```

### 1.2 Flujo de datos

1. **Arranque.** `main.tsx` registra el service worker y monta `App`. `AuthProvider` escucha
   `onAuthStateChange`, carga `profiles` y `user_roles` y expone `profile.center_id`.
2. **Aislamiento entre centros.** Lo hace la RLS de Postgres. El cliente casi nunca filtra por
   `center_id` en las lecturas, y las claves de caché tampoco lo incluyen
   (`['patients', filters]`).
3. **Lecturas.** Hook de dominio → `useQuery` → `supabase.from(...)`. No hay ni una sola
   consulta paginada (`.range(` aparece 0 veces).
4. **Escrituras.** `useMutation` → insert/update → `invalidateQueries` con claves escritas a
   mano (367 llamadas). Las operaciones de varios pasos (crear sesión → Google/Zoom → descontar
   bono → WhatsApp) las coordina **el componente**, no el servidor.
5. **Efectos externos.** Se hacen con edge functions, invocadas desde el cliente o por pg_cron.
   Todas usan la service role, así que la RLS no se aplica y cada función tiene que comprobar
   por su cuenta quién la llama.
6. **Rutas públicas.** Validan un token, HMAC u OTP dentro de la edge function (`patient-portal-*`,
   `public-booking`, `/cita/:token`…).

---

## 2. Zonas críticas

Ordenadas por gravedad. **P0** = arreglar ya · **P1** = próximo ciclo · **P2** = deuda.

### P0-1 · Tres funciones que envían mensajes no comprueban quién las llama

`supabase/config.toml:155-160` desactiva `verify_jwt` para:

| Función | Qué puede hacer cualquiera que conozca la URL (está en el bundle público) |
|---|---|
| `send-invoice-notification` | Enviar una factura **a cualquier email o teléfono**: `patientEmail` y `patientPhone` llegan en el cuerpo y tienen prioridad sobre los del paciente (`index.ts:406-407`) |
| `send-payment-reminder` | Mandar un recordatorio de deuda al paciente. La respuesta devuelve el `whatsappWebLink`, que lleva teléfono y mensaje (`index.ts:302-308`) |
| `send-notification` | Reenviar cualquier notificación por su id, o forzar `processScheduled: true` (`index.ts:600`) |

Las tres crean el cliente con `SUPABASE_SERVICE_ROLE_KEY` y no llaman a
`hasAuthenticatedJWT` ni validan el centro. Lo único que frena el abuso es que los UUID son
difíciles de adivinar, y eso no es un control de acceso. Hablamos de datos de salud y fiscales
(RGPD art. 9).
**Arreglo:** ver §4.2. Solo el frontend (con JWT de usuario) y otras funciones (con service
role) llaman a estas tres, así que se puede exigir autenticación sin romper ningún cron.

### P0-2 · La caché de React Query sobrevivía al cierre de sesión — **ARREGLADO**

`signOut()` limpiaba el estado de auth pero no el `QueryClient`, y las claves no incluyen el
usuario. Si en el mismo navegador entraba otra persona (algo habitual en el ordenador de
recepción de una clínica), veía al instante pacientes, sesiones e informes de IA de la
anterior hasta que llegaba la recarga. Arreglado en `useAuth.tsx` (§4.1).

### P0-3 · Topes silenciosos de 1.000 filas

PostgREST devuelve como mucho 1.000 filas por petición y no avisa. No hay paginación en
ninguna parte, y varios totales se calculan sumando en el navegador:

- `Dashboard.tsx:45-47`: **todas** las facturas emitidas y **todas** las deudas con factura
  del histórico, para calcular "pendiente de cobro".
- `useDebts.tsx:160` (`useDebtStats`): lo mismo.
- Exportaciones contables y Verifactu (`src/lib/export/*`).

Cuando un centro supere 1.000 facturas emitidas, el importe pendiente y las exportaciones
**saldrán incompletos sin ningún error**. Además, `.in('id', [...miles de UUID])`
(`Dashboard.tsx:66`, `useDebts.tsx:196`) acaba superando el límite de longitud de la URL.
**Arreglo:** agregados en SQL (RPC) para los totales y `fetchAllRows` paginado para las
exportaciones (§4.4).

### P1-1 · Todo el frontend en un único chunk — **ARREGLADO**

Las 44 páginas se importaban de forma estática. Un paciente que abría `/cita/:token` en el
móvil descargaba la app entera del terapeuta: Verifactu, gráficas, IA…
(3,8 MB, 1 MB gzip). Ahora hay un chunk por página (§4.1).

### P1-2 · Sin límites de error: un fallo deja la app en blanco — **ARREGLADO**

No había ningún `ErrorBoundary`. Cualquier excepción al renderizar una página desmontaba el
árbol completo, **incluida la grabadora web** (`WebRecorderProvider`), y se perdía la
grabación en curso. Ahora cada ruta tiene su propio límite (§4.1).

### P1-3 · La misma regla de negocio escrita dos veces, y de forma distinta

"Pendiente de cobro" se calcula en `Dashboard.tsx:56-80` y en `useDebts.tsx:160-240` con
reglas **diferentes**:

- Dashboard: "factura sin deuda" = factura sin **ningún** registro de deuda.
- `useDebtStats`: "factura sin deuda" = factura sin deuda **pendiente o parcial**. Una factura
  `issued` con su deuda ya `paid` o `refunded` cuenta como pendiente.

El Dashboard usa `useDebtStats` y solo recurre a su propio cálculo como respaldo
(`Dashboard.tsx:159`). Resultado: hace 4 consultas cuyo resultado casi nunca se muestra, y
dos pantallas pueden no coincidir. **Hace falta decidir cuál es la regla correcta** antes de
unificarlas (§3, fase 2).

El filtro `is_valid` de facturas rectificadas está repetido en 20 ficheros.

### P1-4 · Operaciones de varios pasos coordinadas desde la interfaz

Crear una sesión son 4 o 5 llamadas encadenadas desde el componente
(`QuickCreateSessionDialog.tsx:609-762`): insertar, crear el evento de Google o la reunión de
Zoom, actualizar la sesión con sus ids, descontar el bono y enviar el WhatsApp. Si el usuario
cierra la pestaña a mitad, queda una sesión sin bono descontado o sin evento.

El mismo flujo está **duplicado** en `CreateSessionDialog.tsx:289-326` (página `/sesiones`),
que **no** crea Google ni Zoom. Conviene confirmar si esa diferencia es intencionada.

### P1-5 · Componentes gigantes

| Fichero | Líneas | Señales |
|---|---|---|
| `agenda/SessionDetailDrawer.tsx` | 2.823 | 38 `useState`, 24 hooks, 17 handlers, 9 llamadas directas a supabase |
| `agenda/QuickCreateSessionDialog.tsx` | 1.681 | 19 `useState`, 8 `useEffect` |
| `settings/integrations/AIDocumentTemplatesSection.tsx` | 1.267 | |
| `settings/integrations/GoogleIntegrationSection.tsx` | 1.209 | |
| `invoices/CreateSimpleInvoiceDialog.tsx` | 1.174 | |

Son muy difíciles de testear y cada cambio pequeño obliga a volver a leer mil líneas.

### P2-1 · Edge functions: copiar y pegar en vez de reutilizar

- **101 de 107** funciones definen su propio `corsHeaders`, con 10 variantes distintas de
  cabeceras. Además, la mayoría usa `Access-Control-Allow-Origin: *`, aunque
  `_shared/cors.ts` ya tiene una lista de orígenes permitidos (solo la usan 16).
- 102 funciones crean su cliente service role a mano.
- Versiones mezcladas: `supabase-js@2` (101), `@2.39.3` (16), `@2.49.1`, `@2.108.2`;
  `std@0.168.0` (49) frente a `std@0.190.0` (31); `serve()` (79) frente a `Deno.serve` (27).

### P2-2 · Código compartido cliente↔servidor mantenido a mano

`availability-core` se sincroniza con un script. `consent.ts` se mantiene "a mano, en
paralelo", según el propio CLAUDE.md. `plaud-matching` y `plaud-segmentation` están bien
resueltos: el frontend reexporta el fichero de `_shared`. Ese patrón de reexportación es el
que conviene extender a los demás.

### P2-3 · Otras deudas

- **Claves de caché sin catálogo:** 367 `invalidateQueries` con strings sueltos. Olvidar una
  clave deja datos viejos en pantalla, y ya ocurre: hay grupos como `debts`, `debt-stats`,
  `payments`, `payment-stats`, `invoices` y `session-payment-status` que se invalidan juntos a
  mano en 8 ficheros.
- **`QueryClient` con la configuración por defecto:** `staleTime: 0` y `refetchOnWindowFocus`.
  Cada vez que se vuelve a la pestaña se relanzan todas las consultas activas (el Dashboard
  hace unas 15).
- **Errores tragados:** el Dashboard no mira `.error` en 9 de sus 10 consultas; si fallan,
  muestra 0.
- **Búsqueda de pacientes sin debounce:** una consulta `ilike` por cada tecla
  (`Patients.tsx`, `usePatients.tsx:34`).
- **`select('*')`** en 69 sitios.
- **TypeScript no estricto:** `strictNullChecks: false` oculta justo el tipo de fallo que más
  aparece en este código (`profile?.center_id`).
- **CSP en `<meta>`:** `frame-ancestors` se ignora ahí (`index.html:20`, lo avisa la propia
  consola). La protección contra clickjacking no está activa; tiene que ir como cabecera HTTP.
- **Solo 6 de 74** ficheros que invocan funciones usan `edge-function-error.ts`. En el resto,
  el usuario ve "Edge function returned a non-2xx status code".

---

## 3. Estrategia de refactorización

Principio: **cada paso se despliega por separado y no cambia lo que ve el usuario**. Primero
se añade la red de seguridad (tests) y después se mueve el código.

**Fase 0 — hecha en esta revisión.** Code splitting, límites de error y limpieza de caché
al cerrar sesión.

**Fase 1 — seguridad (1-2 días, requiere desplegar en Lovable).**
1. `_shared/requireCaller.ts` (§4.2) aplicado a `send-invoice-notification`,
   `send-payment-reminder` y `send-notification`.
2. Revisar a mano, una por una, las otras 47 funciones con `verify_jwt = false`. El barrido
   con grep de esta revisión no basta como garantía: las tres de P0-1 pasaban el filtro
   porque la palabra "token" aparece en su código por otros motivos.
   (`patient-portal-register` está desactivada, siempre responde 403, y
   `public-referral-register` es un registro público con rate limit: las dos están bien.)
3. Pasar `frame-ancestors` a una cabecera HTTP en el hosting.

**Fase 2 — corrección de datos (2-3 días).**
1. Decidir la regla de "pendiente de cobro" y dejarla en un único sitio: una función SQL
   `get_receivables_summary(center)` que sustituya los dos cálculos del cliente (§4.4).
2. `fetchAllRows` en las exportaciones contables y Verifactu.
3. Módulo `src/lib/invoice-validity.ts` con el filtro `is_valid` y tests.

**Fase 3 — capa de datos (incremental).**
1. `src/lib/query-keys.ts` (§4.3). Migrar hook a hook, empezando por pagos, deudas y facturas.
2. `QueryClient` con `staleTime: 30_000` y `refetchOnWindowFocus` solo en agenda y
   notificaciones. Esto sí cambia la frescura de los datos, así que decídelo tú.
3. Prohibir con ESLint (`no-restricted-imports` de `@/integrations/supabase/client` en
   `src/pages` y `src/components`) las llamadas directas a supabase fuera de los hooks, para
   no crear nuevas. Las 48 existentes se migran poco a poco.

**Fase 4 — flujos transaccionales.** Llevar "crear sesión" a un hook
`useCreateSessionWorkflow` compartido por los dos diálogos (se elimina la duplicación) y, más
adelante, a una RPC o edge function única e idempotente. Lo mismo para cobrar, facturar y
cancelar.

**Fase 5 — descomponer los componentes gigantes.** `SessionDetailDrawer` se parte en
secciones (datos, pago, factura, IA, integraciones) con un hook de estado por sección. Es
buen candidato para delegar a Codex una vez fijados los límites.

**Fase 6 — edge functions.** Un `_shared/handler.ts` con CORS, cliente, auth y errores, y fijar
versiones en `deno.json` con un import map. Es un cambio mecánico en 100 ficheros (también
para Codex), pero **conviene agruparlo en un solo despliegue en Lovable**.

**Continuo.** Activar `strictNullChecks` por carpetas (empezando por `src/lib`) y exigir test
en todo lo que se mueva a `src/lib`.

---

## 4. Código

### 4.1 Aplicado en esta revisión (sin cambio funcional)

| Fichero | Cambio |
|---|---|
| `src/lib/lazy-page.ts` (nuevo) | `lazyPage()`: `React.lazy` + una recarga automática si un chunk ya no existe tras un despliegue. **Respeta `pwa-update-guard`**: nunca recarga con una grabación en curso |
| `src/components/RouteErrorBoundary.tsx` (nuevo) | `RouteBoundary` = ErrorBoundary + Suspense, se reinicia al cambiar de ruta. `PageLoader` |
| `src/App.tsx` | 43 páginas pasan a `lazyPage(() => import(...))`; `<Routes>` envuelto en `RouteBoundary` |
| `src/components/layout/AppLayout.tsx` | `RouteBoundary` dentro de `<main>`: la barra lateral y la grabadora no se desmontan al cargar ni al fallar una página |
| `src/hooks/useAuth.tsx` | `queryClient.clear()` cuando cambia el usuario autenticado o se cierra sesión (no en la carga inicial ni al refrescar el token) |

**Resultado medido** (`vite build`):

| | Antes | Después |
|---|---|---|
| Chunk inicial | 3.845 KB (1.011 KB gzip) | 901 KB (273 KB gzip) **−73 %** |
| `/cita/:token` (paciente) | 3.845 KB | 901 + 33 KB |
| Nº de chunks JS | 1 | 146 |

`vitest`: 375/375 en verde. `tsc`: sin errores. ESLint: sin avisos nuevos. Comprobado en el
navegador: landing, redirección a `/auth`, `/cita/<token>` público y la 404.

### 4.2 Propuesto: guardia de llamante para las funciones de envío (P0-1)

```ts
// supabase/functions/_shared/requireCaller.ts
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Caller =
  | { kind: "service" }
  | { kind: "user"; userId: string; centerId: string };

/**
 * Identifica quién llama. Acepta:
 *  - la service role (otras edge functions, crons),
 *  - un usuario autenticado con centro asignado.
 * Devuelve null para anónimos o tokens inválidos.
 */
export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  if (jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return { kind: "service" };

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;

  const { data: profile } = await admin
    .from("profiles").select("center_id").eq("id", data.user.id).maybeSingle();
  if (!profile?.center_id) return null;
  return { kind: "user", userId: data.user.id, centerId: profile.center_id };
}

/** Un usuario solo puede actuar sobre recursos de su propio centro. */
export function canActOnCenter(caller: Caller, centerId: string | null | undefined): boolean {
  return caller.kind === "service" || (!!centerId && caller.centerId === centerId);
}
```

Uso en `send-invoice-notification` (el orden importa: comprobar **antes** de enviar):

```ts
const caller = await resolveCaller(req, supabase);
if (!caller) return json({ error: "Unauthorized" }, 401);
// …tras leer la factura:
if (!canActOnCenter(caller, invoice.center_id)) return json({ error: "Forbidden" }, 403);
```

Hay que revisar cómo se llaman entre sí: `send-payment-reminder` invoca `send-notification`.
Tiene que pasarle `Authorization: Bearer <service role>`, o bien reenviar el JWT del usuario.

### 4.3 Propuesto: catálogo de claves de caché

```ts
// src/lib/query-keys.ts
export const qk = {
  patients: {
    all: ["patients"] as const,
    list: (filters?: object) => ["patients", filters] as const,
    detail: (id: string) => ["patient", id] as const,
  },
  debts: { all: ["debts"] as const, stats: ["debt-stats"] as const },
  payments: { all: ["payments"] as const, stats: ["payment-stats"] as const },
  invoices: { all: ["invoices"] as const },
  sessionPaymentStatus: ["session-payment-status"] as const,
} as const;

/** Lo que cambia cuando entra o se mueve dinero. Un solo sitio en vez de 8 copias. */
export const MONEY_KEYS = [
  qk.payments.all, qk.payments.stats, qk.debts.all, qk.debts.stats,
  qk.invoices.all, qk.sessionPaymentStatus,
];

export function invalidateMany(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
```

Las cadenas son las mismas que se usan hoy, así que se puede migrar hook a hook sin romper
nada. Es un cambio puramente mecánico.

### 4.4 Propuesto: totales en SQL y lecturas completas

```sql
-- Una sola regla de "pendiente de cobro", calculada donde están los datos.
-- (Falta decidir la regla: ver P1-3. Aquí, la del Dashboard.)
create or replace function public.get_receivables_summary()
returns table (total_pending numeric, overdue_amount numeric, overdue_count int, total_count int)
language sql stable security invoker as $$
  with open_debts as (
    select d.amount - d.paid_amount as remaining, d.due_date
    from debts d
    left join invoices i on i.id = d.invoice_id
    where d.status in ('pending','partial') and coalesce(i.is_valid, true)
  ), orphan_invoices as (
    select i.total as remaining, null::date as due_date
    from invoices i
    where i.status = 'issued' and i.is_valid
      and not exists (select 1 from debts d where d.invoice_id = i.id)
  ), all_rows as (select * from open_debts union all select * from orphan_invoices)
  select coalesce(sum(remaining),0),
         coalesce(sum(remaining) filter (where due_date < current_date),0),
         (count(*) filter (where due_date < current_date))::int,
         count(*)::int
  from all_rows;
$$;
```

Con `security invoker` se sigue aplicando la RLS, así que el aislamiento por centro no cambia.
Sustituye 4 consultas y 2 `.in()` gigantes por una sola llamada, sin tope de filas.

Para las exportaciones, que sí necesitan las filas:

```ts
// src/lib/fetch-all-rows.ts
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
// uso: fetchAllRows((a, b) => supabase.from('invoices').select('…').order('id').range(a, b))
```

(El `.order()` estable es obligatorio: sin él, las páginas pueden solaparse.)

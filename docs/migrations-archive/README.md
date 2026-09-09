# Histórico de migraciones (archivado el 2026-09-09)

Estas 329 migraciones, de `20251210114820` a `20260909130000`, se sustituyeron por
una única migración base en `supabase/migrations/00000000000000_baseline.sql`.

Se conservan aquí como documentación. **No las ejecutes**: la cadena no se puede
reproducir desde cero. Al replicarla en una base limpia, 12 migraciones fallan y el
esquema resultante tiene 91 tablas en vez de 92.

## Por qué se rompió

Lovable regeneraba migraciones que ya existían escritas a mano, con otro nombre de
archivo y el mismo SQL. Además el registro estaba desalineado: 263 filas en
`supabase_migrations.schema_migrations` frente a 329 archivos, y solo 72 nombres
coincidían exactamente con una fila (el resto llevaba el timestamp desplazado uno o
dos segundos, o eran migraciones aplicadas desde el editor SQL que nunca se
registraron).

## Fallos al replicar la cadena

| Migración | Error |
|---|---|
| `20260709165438_add_consent_emergency_contact` | la columna `requires_emergency_contact` ya existe |
| `20260722154851_18d8ce37…` | la relación `public.emotional_records` no existe |
| `20260723160000_repair_historical_rectification_types` | la relación `rectification_type_repairs` no existe |
| `20260824120000_stripe_live_sandbox_cleanup` | tipos `text` y `payment_status` incompatibles en un UNION |
| `20260828100000_center_drive_connections` | el trigger `update_center_drive_connections_updated_at` ya existe |
| `20260828120000_scope_invoice_documents_by_center` | la política `Read invoice docs from own center` ya existe |
| `20260831120000_expenses_module` | el tipo `expense_status` ya existe |
| `20260831155330_10ad6746…` | la función `public.email_queue_dispatch()` no existe |
| `20260831180000_security_lint_fixes` | la función `public.email_queue_dispatch()` no existe |
| `20260906170146_122465e0…` | el trigger `update_center_plaud_connections_updated_at` ya existe |
| `20260906180156_8b1287bb…` | la relación `plaud_recordings` ya existe |
| `20260909111946_a67a0b01…` | la columna `transcript_attempts` ya existe |


## Fix: Portal del paciente no puede acceder a datos del centro

### Problema

La pagina del portal (`/portal/reservas`) consulta la tabla `centers` directamente:
```typescript
supabase.from('centers').select('name, logo_url, portal_enabled').eq('portal_slug', slug).single()
```

Pero las politicas RLS de `centers` solo permiten SELECT a usuarios autenticados que pertenezcan al centro. El portal se accede de forma anonima, por lo que la consulta devuelve error y se muestra "Centro no encontrado".

### Solucion

Ya existe una funcion RPC `get_portal_center(p_slug text)` con `SECURITY DEFINER` que permite acceso publico a los datos basicos del centro cuando `portal_enabled = true`. Solo hay que cambiar `PatientPortal.tsx` para usar esta funcion en lugar de la consulta directa.

### Cambio en `src/pages/PatientPortal.tsx`

Reemplazar la consulta directa:
```typescript
const { data, error } = await supabase
  .from('centers')
  .select('name, logo_url, portal_enabled')
  .eq('portal_slug', slug)
  .single();
```

Por la llamada al RPC existente:
```typescript
const { data, error } = await supabase
  .rpc('get_portal_center', { p_slug: slug })
  .maybeSingle();
```

La funcion `get_portal_center` ya filtra por `portal_enabled = true` y devuelve `name`, `logo_url` y otros campos necesarios.

### Archivos a modificar

- `src/pages/PatientPortal.tsx` - Usar RPC `get_portal_center` en lugar de consulta directa a `centers`

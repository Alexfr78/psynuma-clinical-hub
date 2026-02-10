

## Registro publico de profesionales para derivaciones

### Resumen
Crear una pagina publica donde profesionales externos puedan darse de alta en el catalogo de derivaciones del centro, rellenando sus propios datos. El registro queda pendiente de aprobacion por el admin. Se requiere aceptacion obligatoria de la politica de privacidad.

### Flujo del usuario

1. El admin copia un enlace publico desde la seccion "Derivaciones" en Configuracion (ej: `/derivaciones/{centerSlug}/registro`)
2. El profesional externo abre el enlace, ve un formulario con los datos requeridos
3. Rellena sus datos: nombre, apellidos, email, telefono, web, descripcion, modalidades, provincias, ciudades, especialidades
4. Acepta la politica de privacidad obligatoriamente
5. Envia el formulario
6. Ve un mensaje de confirmacion ("Tu solicitud ha sido enviada y esta pendiente de aprobacion")
7. El admin ve la solicitud en su panel de Derivaciones y puede aprobarla o rechazarla

### Cambios necesarios

#### 1. Base de datos - Nueva tabla `referral_partner_requests`

Tabla para almacenar solicitudes pendientes de profesionales:

- `id` (uuid, PK)
- `center_id` (uuid, FK centers)
- `name`, `surname`, `email`, `phone`, `website`, `description` (datos del profesional)
- `public_name` (text, opcional)
- `modality` (text[], modalidades)
- `provinces`, `cities`, `specialties` (text[], opcionales)
- `status` (text: 'pending', 'approved', 'rejected', default 'pending')
- `privacy_accepted` (boolean, NOT NULL)
- `privacy_accepted_at` (timestamptz)
- `privacy_policy_url` (text)
- `handled_by` (uuid, FK profiles, nullable)
- `handled_at` (timestamptz, nullable)
- `rejection_reason` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

RLS: INSERT para anon (registro publico), SELECT/UPDATE para usuarios autenticados del mismo centro.

#### 2. Edge Function - `public-referral-register`

Endpoint que:
- Recibe los datos del formulario + `center_slug`
- Valida campos obligatorios (nombre, email, modalidad, privacidad aceptada)
- Resuelve `center_id` a partir del slug
- Inserta en `referral_partner_requests` con status 'pending'
- Devuelve confirmacion

#### 3. Pagina publica - `/derivaciones/{centerSlug}/registro`

Nuevo componente `PublicReferralRegister.tsx`:
- Obtiene las especialidades activas del centro (via RPC publica o edge function)
- Formulario con los mismos campos que `PartnerForm` pero adaptado al publico
- Checkbox obligatorio de aceptacion de politica de privacidad con enlace a `https://psicologosexual.com/politica-de-privacidad/`
- Mensaje de exito tras envio

#### 4. Panel de gestion en Configuracion > Derivaciones

Anadir una tercera pestana "Solicitudes" en `ReferralsSettingsSection`:
- Lista de solicitudes pendientes/aprobadas/rechazadas
- Acciones: Aprobar (crea el `referral_partner` automaticamente), Rechazar (con motivo opcional)
- Boton para copiar enlace publico de registro

#### 5. Hook - `useReferralRequests`

- Query para listar solicitudes del centro
- Mutacion para aprobar (inserta en `referral_partners` y marca como 'approved')
- Mutacion para rechazar

#### 6. Ruta en App.tsx

Anadir ruta publica: `/derivaciones/:centerSlug/registro`

### Secuencia tecnica

1. Crear migracion SQL (tabla + RLS + funcion RPC para obtener especialidades publicas)
2. Crear edge function `public-referral-register`
3. Crear pagina `src/pages/PublicReferralRegister.tsx`
4. Crear hook `src/hooks/useReferralRequests.tsx`
5. Actualizar `ReferralsSettingsSection.tsx` (pestana solicitudes + boton copiar enlace)
6. Actualizar `App.tsx` (nueva ruta publica)


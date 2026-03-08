

## Plan: Acceso al perfil del profesional desde el sidebar

**Objetivo**: Hacer que al pulsar sobre el nombre del profesional en el footer del sidebar, se abra un diálogo/página de perfil donde pueda ver/editar su correo y cambiar su contraseña.

### Cambios

1. **Crear componente `MyProfileDialog`** (`src/components/layout/MyProfileDialog.tsx`)
   - Diálogo modal con dos secciones:
     - **Datos de perfil**: nombre, apellidos, email, teléfono, especialidad (solo lectura o editable según convenga)
     - **Cambiar contraseña**: campos de nueva contraseña y confirmación, usando `supabase.auth.updateUser({ password })`
   - Usa los datos de `useAuth()` para mostrar el perfil actual
   - Usa `useUpdateProfessional` para guardar cambios de perfil
   - Validación con zod

2. **Modificar `AppSidebar.tsx`**
   - Hacer clickable la zona del nombre del profesional en el footer
   - Al hacer clic, abrir `MyProfileDialog`
   - Añadir estado `profileDialogOpen` y cursor pointer visual

### Detalle técnico
- La contraseña se actualiza con `supabase.auth.updateUser({ password: newPassword })` — no requiere la contraseña anterior si el usuario ya tiene sesión activa
- El email se muestra pero no se permite cambiar (para evitar problemas de auth)
- Se reutiliza el patrón de `ResponsiveDialog` existente en el proyecto


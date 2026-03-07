

## Plan: Autenticación de Doble Factor (TOTP)

### Resumen
Implementar 2FA basado en TOTP (Time-based One-Time Password) usando la API MFA nativa de Supabase Auth. Los usuarios podrán activar/desactivar 2FA desde Configuración, y al iniciar sesión se les pedirá el código TOTP si tienen 2FA activo.

### Flujo de usuario

1. **Activar 2FA** (en Configuración > nueva sección "Seguridad"):
   - Botón "Activar autenticación de doble factor"
   - Se muestra código QR generado por `supabase.auth.mfa.enroll()`
   - El usuario escanea con app autenticadora (Google Authenticator, Authy, etc.)
   - Introduce código de 6 dígitos para verificar → `supabase.auth.mfa.challengeAndVerify()`

2. **Login con 2FA activo**:
   - El usuario introduce email + contraseña normalmente
   - Si tiene factor TOTP activo, se muestra pantalla intermedia pidiendo código OTP de 6 dígitos
   - Se verifica con `supabase.auth.mfa.challengeAndVerify()`
   - Si correcto → accede al dashboard

3. **Desactivar 2FA** (en Configuración):
   - Botón para desactivar → `supabase.auth.mfa.unenroll()`

### Cambios técnicos

1. **`src/hooks/useAuth.tsx`**
   - Tras `signIn`, detectar si la sesión tiene `aal1` (necesita 2FA) consultando `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
   - Exponer estado `needsMfaVerification` y función `verifyMfa(code)`

2. **`src/pages/Auth.tsx`**
   - Añadir estado condicional: si `needsMfaVerification === true`, mostrar formulario OTP (6 dígitos) usando el componente `InputOTP` existente
   - Al verificar correctamente, redirigir al dashboard

3. **Nuevo componente `src/components/settings/SecuritySection.tsx`**
   - Sección para activar/desactivar 2FA
   - Genera QR con `qrcode.react` (ya instalado) mostrando URI TOTP
   - Input OTP para verificar el factor

4. **`src/pages/Settings.tsx`**
   - Añadir nueva sección "Seguridad" con icono Shield en el menú lateral
   - Renderizar `SecuritySection`

### Sin cambios de base de datos
Supabase Auth gestiona MFA internamente en `auth.mfa_factors` y `auth.mfa_challenges`. No se necesitan migraciones.


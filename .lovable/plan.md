

## Plan: Recordar 2FA durante 30 días por dispositivo

### Concepto
Cuando el usuario verifica exitosamente el código 2FA, guardar un "token de confianza" en `localStorage` vinculado al dispositivo. En futuros logins, si el token existe y no ha expirado (30 días), saltar la verificación MFA.

### Implementación

#### 1. `src/hooks/useAuth.tsx`

**Tras verificar MFA exitosamente** (`verifyMfa`):
- Generar un token de confianza: `{ userId, timestamp, expiry (30 días) }`
- Guardarlo en `localStorage` con clave `mfa_trusted_device`

**En `signIn`**, antes de pedir MFA:
- Comprobar si existe un token de confianza válido en `localStorage` para ese usuario
- Si es válido (no expirado, mismo userId), saltar MFA → `needsMfa = false`
- Si no es válido o ha expirado, eliminarlo y pedir MFA normalmente

**En `signOut`**:
- NO eliminar el token de confianza (para que persista entre sesiones en el mismo dispositivo)

#### 2. Estructura del token en localStorage

```typescript
interface TrustedDevice {
  userId: string;
  trustedAt: number;  // timestamp
  expiresAt: number;  // trustedAt + 30 días
}
```

Clave: `mfa_trusted_device_{userId_hash}` para soportar múltiples cuentas.

#### 3. `src/components/settings/SecuritySection.tsx`

- Añadir botón "Revocar dispositivos de confianza" que borre los tokens de localStorage
- Informar que al desactivar 2FA se eliminan los tokens automáticamente

### Archivos afectados
- `src/hooks/useAuth.tsx` — lógica de trusted device
- `src/components/settings/SecuritySection.tsx` — opción para revocar

### Sin cambios de base de datos
Todo se gestiona en `localStorage` del dispositivo del usuario.


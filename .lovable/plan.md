

## Diagnóstico: Race condition en el flujo MFA

Hay un bug de **condición de carrera** que hace que el 2FA se salte en el login:

1. `signIn()` llama a `signInWithPassword()` → éxito
2. Inmediatamente, `onAuthStateChange` se dispara → establece `user`
3. Auth.tsx tiene `if (user && !needsMfaVerification) → navigate('/dashboard')` — esto redirige al dashboard ANTES de que `signIn` termine de comprobar el MFA
4. `signIn` continúa, pone `needsMfaVerification = true`... pero ya es tarde, el usuario ya está en el dashboard

Adicionalmente, `handleLogin` hace `navigate('/dashboard')` después de `signIn()` sin comprobar si necesita MFA.

## Plan de corrección

### 1. `useAuth.tsx` — signIn devuelve si necesita MFA

Modificar `signIn` para que devuelva `{ error, needsMfa }`. Así el componente Auth puede decidir si redirigir o mostrar el OTP.

### 2. `useAuth.tsx` — Evitar que onAuthStateChange redirija durante MFA pendiente

Añadir un flag interno `mfaCheckInProgress` que se active durante `signIn` para que Auth.tsx no redirija prematuramente.

### 3. `Auth.tsx` — handleLogin comprueba needsMfa

```typescript
const { error, needsMfa } = await signIn(email, password);
if (!error && !needsMfa) {
  navigate('/dashboard');
}
// Si needsMfa === true, el estado se actualiza y se muestra el OTP
```

### 4. `Auth.tsx` — Guard de redirección

Cambiar la guarda para que no redirija mientras el signIn está en curso:
```typescript
if (user && !needsMfaVerification && !isLoading) {
  navigate('/dashboard');
}
```

### Archivos afectados
- `src/hooks/useAuth.tsx` — Modificar `signIn` para devolver `needsMfa` y controlar la race condition
- `src/pages/Auth.tsx` — Usar el retorno de `signIn` para decidir si navegar o mostrar OTP

No se necesitan cambios de base de datos.


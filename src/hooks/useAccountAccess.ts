import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';
import { qk } from '@/lib/query-keys';

// Todo pasa por la edge function `account-access`. "register" y "patientAccess"
// responden siempre igual: el resultado real llega por email al titular.

async function invokeAccountAccess<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('account-access', { body });
  if (error) throw new Error(await describeEdgeFunctionError(error, fallback));
  return data as T;
}

export function useRequestProfessionalSignup() {
  return useMutation({
    mutationFn: (input: { email: string; firstName: string; lastName: string }) =>
      invokeAccountAccess<{ success: true }>(
        { action: 'register', ...input },
        'No se pudo enviar la solicitud de alta',
      ),
  });
}

export function useRequestPatientAccess() {
  return useMutation({
    mutationFn: (email: string) =>
      invokeAccountAccess<{ success: true }>(
        { action: 'patient-access', email },
        'No se pudo enviar el acceso',
      ),
  });
}

export interface PendingSignup {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function usePendingSignup(token: string | undefined) {
  return useQuery({
    queryKey: qk.pendingSignup.byToken(token),
    queryFn: () =>
      invokeAccountAccess<PendingSignup>(
        { action: 'peek', token },
        'El enlace no es válido o ha caducado',
      ),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });
}

export function useCompleteProfessionalSignup() {
  return useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const result = await invokeAccountAccess<{ success: true; email: string }>(
        { action: 'complete', ...input },
        'No se pudo crear la cuenta',
      );
      const { error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: input.password,
      });
      if (error) throw new Error('Cuenta creada, pero no se pudo iniciar sesión. Entra desde la pantalla de acceso.');
      return result;
    },
  });
}

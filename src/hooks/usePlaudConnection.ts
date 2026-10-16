import { qk } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PlaudConnectionStatus {
  connected: boolean;
  /** Plaud solo está disponible en los centros autorizados (`centers.plaud_enabled`). */
  allowed?: boolean;
  plaud_account_label?: string | null;
  enabled?: boolean | null;
  needs_reconnect?: boolean | null;
  last_error?: string | null;
  created_at?: string | null;
}

/** Estado de la conexión Plaud del centro (sin tokens) y si el centro puede usar Plaud. */
export function usePlaudConnectionStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: qk.plaudConnection.byCenter(profile?.center_id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<PlaudConnectionStatus>('plaud-connection', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
    staleTime: 5 * 60 * 1000,
  });
}

/** true solo cuando el servidor confirma que el centro puede usar Plaud. */
export function usePlaudAllowed(): boolean {
  return usePlaudConnectionStatus().data?.allowed === true;
}

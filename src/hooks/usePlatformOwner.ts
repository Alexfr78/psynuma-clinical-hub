import { qk } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Dueño de la plataforma: el único que crea y publica versiones (tabla platform_owners). */
export function usePlatformOwner() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: qk.platformOwner.byUser(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('am_i_platform_owner');
      if (error) throw error;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });
  return { isPlatformOwner: query.data === true, isLoading: query.isLoading };
}

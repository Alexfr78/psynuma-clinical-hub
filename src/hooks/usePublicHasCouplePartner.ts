import { qk } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Si el titular de un enlace público (/cita/:token o /pagar/:token) tiene pareja
 * vinculada. Solo un sí/no: el nombre de la pareja es un dato de otro paciente y
 * no debe llegar a quien tenga el enlace.
 */
export function usePublicHasCouplePartner(tokens: { sessionToken?: string; debtToken?: string }) {
  const { sessionToken, debtToken } = tokens;
  return useQuery({
    queryKey: qk.publicCouplePartner.list(sessionToken ?? null, debtToken ?? null),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_has_couple_partner', {
        p_session_token: sessionToken,
        p_debt_token: debtToken,
      });
      // Con error, simplemente no se ofrece compartir.
      if (error) {
        console.error('Error fetching couple partner:', error);
        return false;
      }
      return data === true;
    },
    enabled: !!(sessionToken || debtToken),
    staleTime: 5 * 60 * 1000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Nombre de pila de la pareja vinculada del titular de un enlace público
 * (/cita/:token o /pagar/:token). null si no tiene pareja vinculada.
 */
export function usePublicCouplePartnerName(tokens: { sessionToken?: string; debtToken?: string }) {
  const { sessionToken, debtToken } = tokens;
  return useQuery({
    queryKey: ['public-couple-partner', sessionToken ?? null, debtToken ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_couple_partner_first_name', {
        p_session_token: sessionToken,
        p_debt_token: debtToken,
      });
      // Sin pareja o con error, simplemente no se ofrece compartir.
      if (error) {
        console.error('Error fetching couple partner:', error);
        return null;
      }
      return (data as string | null) || null;
    },
    enabled: !!(sessionToken || debtToken),
    staleTime: 5 * 60 * 1000,
  });
}

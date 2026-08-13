import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PublicDebt {
  id: string;
  amount: number;
  paid_amount: number | null;
  status: string;
  created_at: string;
  center_id: string;
  patient: {
    first_name: string;
    last_name: string;
  };
  session: {
    id: string;
    session_date: string;
    session_type: string | null;
  } | null;
  center: {
    id: string;
    name: string;
    bizum_phone: string | null;
    has_stripe: boolean;
  };
}

interface BonoTemplate {
  id: string;
  name: string;
  total_sessions: number;
  total_price: number;
  price_per_session: number;
}

export function usePublicDebt(token: string | undefined) {
  return useQuery({
    queryKey: ['public-debt', token],
    queryFn: async (): Promise<PublicDebt | null> => {
      if (!token) return null;

      // Resolve a minimal token-scoped projection. Anonymous table reads stay
      // blocked because debts and patients contain sensitive information.
      const { data: debt, error: debtError } = await supabase
        .rpc('get_public_debt_by_token', { p_token: token });

      if (debtError || !debt) {
        console.error('Error fetching debt:', debtError);
        return null;
      }

      return debt as unknown as PublicDebt;
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePublicBonoTemplates(token: string | undefined) {
  return useQuery({
    queryKey: ['public-bono-templates', token],
    queryFn: async (): Promise<BonoTemplate[]> => {
      if (!token) return [];

      const { data, error } = await supabase
        .rpc('get_public_bono_templates_for_debt', { p_token: token });

      if (error) {
        console.error('Error fetching bono templates:', error);
        return [];
      }

      return (data || []) as unknown as BonoTemplate[];
    },
    enabled: !!token,
  });
}

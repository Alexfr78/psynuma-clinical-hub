import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PublicDebt {
  id: string;
  amount: number;
  paid_amount: number | null;
  status: string;
  created_at: string;
  access_token: string;
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
    oauth_stripe_credentials: string | null;
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

      // Fetch debt by access_token
      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .select(`
          id,
          amount,
          paid_amount,
          status,
          created_at,
          access_token,
          center_id,
          patient_id,
          session_id
        `)
        .eq('access_token', token)
        .single();

      if (debtError || !debt) {
        console.error('Error fetching debt:', debtError);
        return null;
      }

      // Fetch patient
      const { data: patient } = await supabase
        .from('patients')
        .select('first_name, last_name')
        .eq('id', debt.patient_id)
        .single();

      // Fetch session if exists
      let session = null;
      if (debt.session_id) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id, session_date, session_type')
          .eq('id', debt.session_id)
          .single();
        session = sessionData;
      }

      // Fetch center
      const { data: center } = await supabase
        .from('centers')
        .select('id, name, bizum_phone, oauth_stripe_credentials')
        .eq('id', debt.center_id)
        .single();

      return {
        ...debt,
        patient: patient || { first_name: '', last_name: '' },
        session,
        center: center || { id: '', name: '', bizum_phone: null, oauth_stripe_credentials: null },
      };
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePublicBonoTemplates(centerId: string | undefined) {
  return useQuery({
    queryKey: ['public-bono-templates', centerId],
    queryFn: async (): Promise<BonoTemplate[]> => {
      if (!centerId) return [];

      const { data, error } = await supabase
        .from('bono_templates')
        .select('id, name, total_sessions, total_price, price_per_session')
        .eq('center_id', centerId)
        .eq('is_active', true)
        .order('total_sessions');

      if (error) {
        console.error('Error fetching bono templates:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!centerId,
  });
}

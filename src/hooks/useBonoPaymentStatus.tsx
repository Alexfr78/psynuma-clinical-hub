import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BonoPaymentStatus {
  hasPendingPayment: boolean;
  isPaid: boolean;
  isPartial: boolean;
  debt: {
    id: string;
    amount: number;
    paid_amount: number;
    status: string;
    invoice_id: string | null;
  } | null;
  bono: {
    id: string;
    name: string;
    total_price: number;
    total_sessions: number;
    used_sessions: number;
  } | null;
}

export function useBonoPaymentStatus(bonoId: string | null | undefined) {
  return useQuery({
    queryKey: ['bono-payment-status', bonoId],
    queryFn: async (): Promise<BonoPaymentStatus> => {
      if (!bonoId) {
        return {
          hasPendingPayment: false,
          isPaid: false,
          isPartial: false,
          debt: null,
          bono: null,
        };
      }

      // Fetch bono info
      const { data: bono, error: bonoError } = await supabase
        .from('bonos')
        .select('id, name, total_price, total_sessions, used_sessions')
        .eq('id', bonoId)
        .maybeSingle();

      if (bonoError) throw bonoError;

      // Fetch debt linked to this bono
      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .select('id, amount, paid_amount, status, invoice_id')
        .eq('bono_id', bonoId)
        .maybeSingle();

      if (debtError) throw debtError;

      return {
        hasPendingPayment: debt ? debt.status !== 'paid' : false,
        isPaid: debt?.status === 'paid',
        isPartial: debt?.status === 'partial',
        debt: debt as BonoPaymentStatus['debt'],
        bono: bono ? {
          id: bono.id,
          name: bono.name,
          total_price: Number(bono.total_price),
          total_sessions: bono.total_sessions,
          used_sessions: bono.used_sessions || 0,
        } : null,
      };
    },
    enabled: !!bonoId,
  });
}

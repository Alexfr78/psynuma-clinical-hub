import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface StripeDiagnosticEntry {
  id: string;
  at: string;
  step: string | null;
  error_code: string | null;
  message: string | null;
}

// Reads the current professional's Stripe integration notices. RLS restricts
// the rows to `professional_id = auth.uid()`, so no server-side scoping is
// needed here. Surfaces the notices raised by the stripe-webhook function
// (repeated failures, orphan refunds, bonos needing review).
export function useStripeDiagnostics(limit = 20) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['stripe-diagnostics', profile?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_errors')
        .select('id, at, step, error_code, message')
        .eq('provider', 'stripe')
        .order('at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as StripeDiagnosticEntry[];
    },
    enabled: !!profile?.id,
  });
}

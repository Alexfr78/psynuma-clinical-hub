import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PublicPatientReport {
  expired: boolean;
  title: string;
  contentMarkdown: string | null;
  patientFirstName: string | null;
  centerName: string | null;
  centerLogoUrl: string | null;
  generatedAt: string;
  expiresAt: string;
}

/**
 * Lee el informe publicado en `/informe/:token` a través de la edge function
 * `view-patient-report`, que además registra el acceso (IP + hora) en
 * `audit_logs`. Por eso `staleTime: Infinity` y sin refetch automático: cada
 * llamada a la función cuenta como un acceso registrado, así que solo debe
 * dispararse una vez por carga de página, no en cada refoco de la ventana.
 */
export function usePublicPatientReport(token: string | undefined) {
  return useQuery({
    queryKey: ['public-patient-report', token],
    queryFn: async (): Promise<PublicPatientReport> => {
      if (!token) throw new Error('No token');

      const { data, error } = await supabase.functions.invoke('view-patient-report', {
        headers: { 'x-report-token': token },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as PublicPatientReport;
    },
    enabled: !!token,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

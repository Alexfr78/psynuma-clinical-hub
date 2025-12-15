import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useProfessionalIntegrations } from './useProfessionalIntegrations';
import { toast } from 'sonner';

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export function useGoogleCalendarSync() {
  const { profile } = useAuth();
  const { integrations, isProviderConnected } = useProfessionalIntegrations();
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async (dateRange?: { from: string; to: string }): Promise<SyncResult> => {
      if (!profile?.id) throw new Error('No professional ID');

      const { data, error } = await supabase.functions.invoke('sync-google-calendar', {
        body: {
          professional_id: profile.id,
          date_from: dateRange?.from,
          date_to: dateRange?.to,
        },
      });

      if (error) throw error;
      return data as SyncResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      
      // Check for errors first - show error message instead of success
      if (data.errors && data.errors.length > 0) {
        console.error('Sync errors:', data.errors);
        const errorMessage = data.errors[0];
        
        // Show user-friendly error messages based on error type
        if (errorMessage.includes('access token') || errorMessage.includes('autenticación') || errorMessage.includes('Reconecta')) {
          toast.error('Error de autenticación con Google. Por favor, reconecta tu cuenta en Ajustes > Integraciones');
        } else if (errorMessage.includes('No Google connection')) {
          toast.error('No hay conexión con Google. Configura tu cuenta en Ajustes > Integraciones');
        } else if (errorMessage.includes('not enabled')) {
          toast.error('Google Calendar no está habilitado. Actívalo en Ajustes > Integraciones');
        } else {
          toast.error(`Error al sincronizar: ${errorMessage}`);
        }
        return; // Don't show success message when there are errors
      }
      
      const messages: string[] = [];
      if (data.created > 0) messages.push(`${data.created} creados`);
      if (data.updated > 0) messages.push(`${data.updated} actualizados`);
      if (data.deleted > 0) messages.push(`${data.deleted} eliminados`);
      
      if (messages.length > 0) {
        toast.success(`Sincronizado: ${messages.join(', ')}`);
      } else {
        toast.info('Todo está sincronizado');
      }
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast.error('Error al sincronizar con Google Calendar');
    },
  });

  const isAvailable = Boolean(
    integrations?.google_calendar_enabled && isProviderConnected('google')
  );

  return {
    sync: () => syncMutation.mutate(undefined),
    syncWithRange: (from: string, to: string) => syncMutation.mutate({ from, to }),
    isSyncing: syncMutation.isPending,
    isAvailable,
    lastSyncAt: integrations?.last_google_sync_at,
  };
}

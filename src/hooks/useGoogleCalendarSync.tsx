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
      
      const messages: string[] = [];
      if (data.created > 0) messages.push(`${data.created} creados`);
      if (data.updated > 0) messages.push(`${data.updated} actualizados`);
      if (data.deleted > 0) messages.push(`${data.deleted} eliminados`);
      
      if (messages.length > 0) {
        toast.success(`Sincronizado: ${messages.join(', ')}`);
      } else {
        toast.info('Todo está sincronizado');
      }

      if (data.errors && data.errors.length > 0) {
        console.warn('Sync errors:', data.errors);
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

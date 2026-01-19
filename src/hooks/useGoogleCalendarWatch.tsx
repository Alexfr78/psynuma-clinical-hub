import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface WatchStatus {
  isActive: boolean;
  expiration?: string;
  channelId?: string;
}

interface RenewResult {
  renewed: boolean;
  reason?: string;
  hoursRemaining?: number;
}

export function useGoogleCalendarWatch() {
  const { profile } = useAuth();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({ isActive: false });

  const setupWatch = useCallback(async () => {
    if (!profile?.id) {
      toast.error('No se pudo obtener el ID del profesional');
      return false;
    }

    setIsSettingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-google-calendar-watch', {
        body: { professional_id: profile.id },
      });

      if (error) {
        console.error('Error setting up watch:', error);
        toast.error('Error al activar notificaciones push');
        return false;
      }

      if (data?.success) {
        setWatchStatus({
          isActive: true,
          expiration: data.expiration,
          channelId: data.channel_id,
        });
        toast.success('Sincronización en tiempo real activada');
        return true;
      }

      toast.error(data?.error || 'Error desconocido');
      return false;
    } catch (error) {
      console.error('Setup watch error:', error);
      toast.error('Error al configurar sincronización');
      return false;
    } finally {
      setIsSettingUp(false);
    }
  }, [profile?.id]);

  const checkWatchStatus = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // Use the safe view that excludes tokens
      const { data: conn } = await supabase
        .from('oauth_connections_safe')
        .select('watch_channel_id, watch_expires_at')
        .eq('professional_id', profile.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (conn?.watch_expires_at) {
        const expiration = new Date(conn.watch_expires_at);
        const isActive = expiration > new Date();
        
        setWatchStatus({
          isActive,
          expiration: conn.watch_expires_at,
          channelId: conn.watch_channel_id || undefined,
        });
      } else {
        setWatchStatus({ isActive: false });
      }
    } catch (error) {
      console.error('Error checking watch status:', error);
    }
  }, [profile?.id]);

  // Check if watch channel is expiring soon and renew if needed
  // This calls the Edge Function which handles the actual renewal and status updates
  const renewWatchIfExpiring = useCallback(async (): Promise<RenewResult> => {
    if (!profile?.id) {
      return { renewed: false, reason: 'no_profile' };
    }

    try {
      // Get watch_expires_at from oauth_connections_safe (tokens not needed, edge function handles them)
      const { data: conn } = await supabase
        .from('oauth_connections_safe')
        .select('watch_expires_at, google_calendar_id, expires_at')
        .eq('professional_id', profile.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (!conn) {
        return { renewed: false, reason: 'no_connection' };
      }

      if (!conn.watch_expires_at) {
        return { renewed: false, reason: 'no_watch' };
      }

      if (!conn.google_calendar_id) {
        return { renewed: false, reason: 'no_calendar_selected' };
      }

      const expiresAt = new Date(conn.watch_expires_at);
      const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursUntilExpiry > 24) {
        return { renewed: false, reason: 'not_expiring', hoursRemaining: hoursUntilExpiry };
      }

      console.log(`[WATCH] Channel expiring in ${hoursUntilExpiry.toFixed(1)}h, renewing...`);

      // Call setupWatch which handles everything including status updates in Edge Function
      const success = await setupWatch();

      if (success) {
        return { renewed: true, hoursRemaining: hoursUntilExpiry };
      } else {
        // Edge Function updates last_sync_status on failure
        return { renewed: false, reason: 'renewal_failed', hoursRemaining: hoursUntilExpiry };
      }
    } catch (error) {
      console.error('[WATCH] Error checking/renewing watch:', error);
      return { renewed: false, reason: 'error' };
    }
  }, [profile?.id, setupWatch]);

  return {
    setupWatch,
    checkWatchStatus,
    renewWatchIfExpiring,
    isSettingUp,
    watchStatus,
  };
}

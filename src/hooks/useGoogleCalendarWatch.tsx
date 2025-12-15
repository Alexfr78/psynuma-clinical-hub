import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface WatchStatus {
  isActive: boolean;
  expiration?: string;
  channelId?: string;
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
      const { data: channels } = await supabase
        .from('google_calendar_channels')
        .select('channel_id, expiration')
        .eq('professional_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (channels && channels.length > 0) {
        const channel = channels[0];
        const expiration = new Date(channel.expiration);
        const isActive = expiration > new Date();
        
        setWatchStatus({
          isActive,
          expiration: channel.expiration,
          channelId: channel.channel_id,
        });
      } else {
        setWatchStatus({ isActive: false });
      }
    } catch (error) {
      console.error('Error checking watch status:', error);
    }
  }, [profile?.id]);

  return {
    setupWatch,
    checkWatchStatus,
    isSettingUp,
    watchStatus,
  };
}

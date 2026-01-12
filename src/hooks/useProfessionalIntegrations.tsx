import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface ProfessionalIntegration {
  id: string;
  professional_id: string;
  // WhatsApp
  whatsapp_enabled: boolean;
  whatsapp_send_method: 'web' | 'api';
  whatsapp_access_token: string | null; // Note: This is encrypted in the database - don't expose to UI
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  // Note: whatsapp_access_token is handled separately via save-oauth-credentials edge function
  // Video
  zoom_enabled: boolean;
  google_meet_enabled: boolean;
  default_video_provider: 'none' | 'zoom' | 'google_meet';
  // Google Calendar
  google_calendar_enabled: boolean;
  google_calendar_sync_mode: 'one_way' | 'two_way';
  last_google_sync_at: string | null;
  google_event_title_format: string | null;
  google_event_description_format: string | null;
  google_sync_days_past: number;
  google_sync_days_future: number;
  // Stripe
  stripe_enabled: boolean;
  stripe_payment_mode: 'required_now' | 'post_pay' | 'scheduled_before';
  stripe_scheduled_hours_before: number;
  created_at: string;
  updated_at: string;
}

export interface OAuthConnection {
  id: string;
  professional_id: string;
  provider: 'google' | 'zoom' | 'stripe';
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  provider_account_id: string | null;
  stripe_account_id: string | null;
  stripe_account_status: 'pending' | 'active' | 'restricted' | 'disabled' | null;
  google_calendar_id: string | null;
  watch_channel_id: string | null;
  watch_resource_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useProfessionalIntegrations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const professionalId = profile?.id;

  // Fetch integrations for current professional
  const { data: integrations, isLoading: isLoadingIntegrations } = useQuery({
    queryKey: ['professional-integrations', professionalId],
    queryFn: async () => {
      if (!professionalId) return null;
      
      const { data, error } = await supabase
        .from('professional_integrations')
        .select('*')
        .eq('professional_id', professionalId)
        .maybeSingle();

      if (error) throw error;
      return data as ProfessionalIntegration | null;
    },
    enabled: !!professionalId,
  });

  // Fetch OAuth connections for current professional
  const { data: oauthConnections, isLoading: isLoadingOAuth } = useQuery({
    queryKey: ['oauth-connections', professionalId],
    queryFn: async () => {
      if (!professionalId) return [];
      
      const { data, error } = await supabase
        .from('oauth_connections')
        .select('*')
        .eq('professional_id', professionalId);

      if (error) throw error;
      return (data || []) as OAuthConnection[];
    },
    enabled: !!professionalId,
  });

  // Create or update integrations
  const updateIntegrations = useMutation({
    mutationFn: async (updates: Partial<Omit<ProfessionalIntegration, 'id' | 'professional_id' | 'created_at' | 'updated_at'>>) => {
      if (!professionalId) throw new Error('No professional ID');

      // Check if record exists
      const { data: existing } = await supabase
        .from('professional_integrations')
        .select('id')
        .eq('professional_id', professionalId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('professional_integrations')
          .update(updates)
          .eq('professional_id', professionalId);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('professional_integrations')
          .insert({ professional_id: professionalId, ...updates });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professional-integrations', professionalId] });
      toast.success('Configuración guardada');
    },
    onError: (error) => {
      console.error('Error updating integrations:', error);
      toast.error('Error al guardar la configuración');
    },
  });

  // Get OAuth connection by provider
  const getOAuthConnection = (provider: 'google' | 'zoom' | 'stripe'): OAuthConnection | undefined => {
    return oauthConnections?.find(c => c.provider === provider);
  };

  // Check if a provider is connected
  const isProviderConnected = (provider: 'google' | 'zoom' | 'stripe'): boolean => {
    const connection = getOAuthConnection(provider);
    if (!connection) return false;
    
    // For Stripe, check account status
    if (provider === 'stripe') {
      return connection.stripe_account_status === 'active';
    }
    
    // For others, check if we have an access token
    return !!connection.access_token;
  };

  // Disconnect OAuth provider
  const disconnectProvider = useMutation({
    mutationFn: async (provider: 'google' | 'zoom' | 'stripe') => {
      if (!professionalId) throw new Error('No professional ID');

      if (provider === 'google') {
        // Get connection with tokens BEFORE any cleanup
        const { data: connection } = await supabase
          .from('oauth_connections')
          .select('refresh_token, access_token, watch_channel_id, watch_resource_id, google_calendar_id')
          .eq('professional_id', professionalId)
          .eq('provider', 'google')
          .single();

        if (connection) {
          // 1. Stop the watch channel (best-effort via Edge Function)
          if (connection.watch_channel_id && connection.watch_resource_id) {
            console.log('[DISCONNECT] Stopping watch channel...');
            try {
              const { data, error } = await supabase.functions.invoke('stop-google-channel');
              if (error) {
                console.warn('[DISCONNECT] Failed to stop watch channel:', error);
              } else {
                console.log('[DISCONNECT] Watch channel stop result:', data);
              }
            } catch (e) {
              console.warn('[DISCONNECT] Error calling stop-google-channel:', e);
            }
          }

          // 2. Revoke the refresh token at Google (best-effort)
          const tokenToRevoke = connection.refresh_token || connection.access_token;
          if (tokenToRevoke) {
            console.log('[DISCONNECT] Revoking token at Google...');
            try {
              const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token: tokenToRevoke }),
              });
              console.log('[DISCONNECT] Revoke response status:', revokeResponse.status);
            } catch (e) {
              console.warn('[DISCONNECT] Error revoking token:', e);
            }
          }

          // 3. Delete calendar_events
          const { error: calendarError } = await supabase
            .from('calendar_events')
            .delete()
            .eq('professional_id', professionalId);

          if (calendarError) {
            console.error('[DISCONNECT] Error deleting calendar events:', calendarError);
          }

          // 4. Delete google_calendar_channels
          const { error: channelsError } = await supabase
            .from('google_calendar_channels')
            .delete()
            .eq('professional_id', professionalId);

          if (channelsError) {
            console.error('[DISCONNECT] Error deleting calendar channels:', channelsError);
          }

          // 5. Delete "Bloqueado" sessions imported from Google
          const { error: blockedError } = await supabase
            .from('sessions')
            .delete()
            .eq('professional_id', professionalId)
            .eq('session_type', 'Bloqueado')
            .not('google_calendar_event_id', 'is', null);

          if (blockedError) {
            console.error('[DISCONNECT] Error deleting blocked sessions:', blockedError);
          }

          // 6. Clear google_calendar_event_id from regular sessions
          const { error: clearError } = await supabase
            .from('sessions')
            .update({ google_calendar_event_id: null })
            .eq('professional_id', professionalId)
            .not('google_calendar_event_id', 'is', null);

          if (clearError) {
            console.error('[DISCONNECT] Error clearing google_calendar_event_id:', clearError);
          }

          // 7. Partial reset of oauth_connections - KEEP google_calendar_id for future reconnection
          const { error: updateError } = await supabase
            .from('oauth_connections')
            .update({
              access_token: null,
              refresh_token: null,
              expires_at: null,
              sync_token: null,
              watch_channel_id: null,
              watch_resource_id: null,
              watch_expires_at: null,
              last_sync_at: null,
              last_sync_status: null,
              needs_reconnect: false,
              // CRITICAL: Keep google_calendar_id so user doesn't have to re-select
              // google_calendar_id: connection.google_calendar_id,
            })
            .eq('professional_id', professionalId)
            .eq('provider', 'google');

          if (updateError) {
            console.error('[DISCONNECT] Error updating oauth_connection:', updateError);
            throw updateError;
          }

          console.log('[DISCONNECT] Google disconnected successfully (calendar_id preserved)');
          return;
        }
      }

      // For non-Google providers, just delete the row
      const { error } = await supabase
        .from('oauth_connections')
        .delete()
        .eq('professional_id', professionalId)
        .eq('provider', provider);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oauth-connections', professionalId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-health'] });
      toast.success('Integración desconectada');
    },
    onError: (error) => {
      console.error('Error disconnecting provider:', error);
      toast.error('Error al desconectar');
    },
  });

  return {
    integrations,
    oauthConnections,
    isLoading: isLoadingIntegrations || isLoadingOAuth,
    updateIntegrations,
    getOAuthConnection,
    isProviderConnected,
    disconnectProvider,
  };
}

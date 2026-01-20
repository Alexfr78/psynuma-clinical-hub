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

// OAuthConnection interface - uses oauth_connections_safe view
// IMPORTANT: This view intentionally excludes sensitive fields (access_token, refresh_token)
// Those fields are only accessible server-side via edge functions
export interface OAuthConnection {
  id: string;
  professional_id: string;
  provider: 'google' | 'zoom' | 'stripe';
  // Note: access_token and refresh_token are NOT available in this view for security
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
  last_sync_at: string | null;
  last_sync_status: string | null;
  needs_reconnect: boolean | null;
  consecutive_sync_errors: number | null;
  last_sync_error_code: string | null;
  last_sync_error_message: string | null;
}

export function useProfessionalIntegrations(overrideProfessionalId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  // Use override if provided, otherwise fall back to authenticated user's ID
  const professionalId = overrideProfessionalId || profile?.id;

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
  // Uses oauth_connections_safe view which excludes sensitive tokens
  const { data: oauthConnections, isLoading: isLoadingOAuth } = useQuery({
    queryKey: ['oauth-connections', professionalId],
    queryFn: async () => {
      if (!professionalId) return [];
      
      // Use the safe view that excludes access_token and refresh_token
      const { data, error } = await supabase
        .from('oauth_connections_safe')
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
    
    // For others, check if connection exists and has valid data
    // Note: access_token is not exposed in safe view, so we check for provider_account_id
    // or scope (which indicates tokens were obtained) or expires_at being set
    return !!connection.expires_at || !!connection.scope;
  };

  // Disconnect OAuth provider
  const disconnectProvider = useMutation({
    mutationFn: async (provider: 'google' | 'zoom' | 'stripe') => {
      if (!professionalId) throw new Error('No professional ID');

      if (provider === 'google') {
        // Get connection metadata BEFORE any cleanup
        // Note: tokens are not accessible from client-side - edge function handles token revocation
        const { data: connection } = await supabase
          .from('oauth_connections_safe')
          .select('watch_channel_id, watch_resource_id, google_calendar_id')
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

          // 2. Token revocation is now handled server-side
          // The edge function stop-google-channel revokes tokens before clearing them
          console.log('[DISCONNECT] Token revocation handled by edge function');

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

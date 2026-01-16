import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiagnosticsResult {
  generated_at: string;
  app: {
    name: string;
    version: string;
    build_env: string;
  };
  user_context: {
    professional_id: string;
    environment: string;
  };
  google_connection: {
    provider: string;
    connected: boolean;
    needs_reconnect: boolean;
    scopes: string[];
    has_refresh_token: boolean;
    token_expires_at: string | null;
    last_token_refresh_at: string | null;
    last_token_refresh_result: string | null;
    last_token_refresh_error: {
      http_status: number | null;
      error: string | null;
      error_description: string | null;
    } | null;
  };
  sync_state: {
    google_calendar_id: string | null;
    sync_token_present: boolean;
    sync_token_last_set_at: string | null;
    webhook: {
      enabled: boolean;
      channel_id: string | null;
      resource_id: string | null;
      expiration: string | null;
      last_webhook_received_at: string | null;
    };
    last_sync: {
      last_sync_at: string | null;
      status: string | null;
      error: {
        code: string | null;
        message: string | null;
        http_status: number | null;
      } | null;
    };
    consecutive_errors: number;
  };
  recent_errors: Array<{
    at: string;
    source: string;
    step: string | null;
    http_status: number | null;
    error_code: string | null;
    message: string | null;
    correlation_id: string | null;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header and extract user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const professionalId = user.id;

    // Parse request body for optional limit
    let limit = 50;
    try {
      const body = await req.json();
      if (body?.limit && typeof body.limit === 'number') {
        limit = Math.min(Math.max(body.limit, 1), 200); // Clamp between 1 and 200
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[DIAGNOSTICS] Generating for professional ${professionalId}, limit ${limit}`);

    // Fetch OAuth connection data
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select(`
        *
      `)
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .maybeSingle();

    // Fetch professional integrations
    const { data: integrations } = await supabase
      .from('professional_integrations')
      .select('google_calendar_enabled, google_calendar_sync_mode')
      .eq('professional_id', professionalId)
      .maybeSingle();

    // Fetch recent integration errors
    const { data: recentErrors } = await supabase
      .from('integration_errors')
      .select('at, source, step, http_status, error_code, message, correlation_id')
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .order('at', { ascending: false })
      .limit(limit);

    // Build diagnostics object
    const isConnected = !!connection?.refresh_token;
    const tokenExpiresAt = connection?.expires_at ? new Date(connection.expires_at) : null;
    const tokenExpired = tokenExpiresAt ? tokenExpiresAt < new Date() : true;

    // Parse last sync error info from raw if available
    let lastSyncError: { code: string | null; message: string | null; http_status: number | null } | null = null;
    if (connection?.last_sync_error_code || connection?.last_sync_error_message) {
      lastSyncError = {
        code: connection.last_sync_error_code || null,
        message: connection.last_sync_error_message || null,
        http_status: connection.last_sync_error_raw?.http_status || null,
      };
    }

    // Parse last token refresh error
    let lastTokenRefreshError = null;
    if (connection?.last_token_refresh_result === 'fail') {
      // Try to get error info from recent errors
      const tokenError = recentErrors?.find(e => e.step === 'refresh_token');
      if (tokenError) {
        lastTokenRefreshError = {
          http_status: tokenError.http_status,
          error: tokenError.error_code,
          error_description: tokenError.message,
        };
      }
    }

    const diagnostics: DiagnosticsResult = {
      generated_at: new Date().toISOString(),
      app: {
        name: 'Psycma',
        version: '1.0.0',
        build_env: Deno.env.get('DENO_DEPLOYMENT_ID') ? 'production' : 'development',
      },
      user_context: {
        professional_id: professionalId,
        environment: supabaseUrl.includes('localhost') ? 'local' : 'production',
      },
      google_connection: {
        provider: 'google',
        connected: isConnected,
        needs_reconnect: connection?.needs_reconnect || false,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
        ],
        has_refresh_token: !!connection?.refresh_token,
        token_expires_at: connection?.expires_at || null,
        last_token_refresh_at: connection?.last_token_refresh_at || null,
        last_token_refresh_result: connection?.last_token_refresh_result || null,
        last_token_refresh_error: lastTokenRefreshError,
      },
      sync_state: {
        google_calendar_id: connection?.google_calendar_id || null,
        sync_token_present: !!connection?.sync_token,
        sync_token_last_set_at: connection?.sync_token_last_set_at || null,
        webhook: {
          enabled: !!connection?.watch_channel_id && 
                   (connection?.watch_expires_at ? new Date(connection.watch_expires_at) > new Date() : false),
          channel_id: connection?.watch_channel_id || null,
          resource_id: connection?.watch_resource_id || null,
          expiration: connection?.watch_expires_at || null,
          last_webhook_received_at: connection?.last_webhook_received_at || null,
        },
        last_sync: {
          last_sync_at: connection?.last_sync_at || null,
          status: connection?.last_sync_status || null,
          error: lastSyncError,
        },
        consecutive_errors: connection?.consecutive_sync_errors || 0,
      },
      recent_errors: (recentErrors || []).map(e => ({
        at: e.at,
        source: e.source,
        step: e.step,
        http_status: e.http_status,
        error_code: e.error_code,
        message: e.message,
        correlation_id: e.correlation_id,
      })),
    };

    console.log(`[DIAGNOSTICS] Generated successfully, ${diagnostics.recent_errors.length} errors included`);

    return new Response(
      JSON.stringify(diagnostics, null, 2),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error: unknown) {
    console.error('[DIAGNOSTICS:ERROR]', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

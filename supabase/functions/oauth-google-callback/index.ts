import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM decryption (matching save-oauth-credentials format)
async function decryptAES256GCM(encryptedData: string, encryptionKey: string): Promise<string> {
  // Use key as UTF-8 string with padding (same as save-oauth-credentials)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  
  // Decode Base64
  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes) and ciphertext+authTag (rest)
  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertextWithTag
  );
  
  return new TextDecoder().decode(decrypted);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    console.log('[OAUTH:CALLBACK] Google OAuth callback received', { code: !!code, state, error });

    if (error) {
      console.error('[OAUTH:ERROR] Google OAuth error:', error);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.error('[OAUTH:ERROR] Missing code or state');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=missing_params`);
    }

    // Decode state to get professional_id
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('[OAUTH:ERROR] Invalid state:', e);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=invalid_state`);
    }

    const { professional_id, redirect_uri } = stateData;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get professional's center_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', professional_id)
      .single();

    if (profileError || !profile?.center_id) {
      console.error('[OAUTH:ERROR] Could not get professional center:', profileError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=no_center`);
    }

    // Get OAuth credentials from center
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('oauth_google_client_id, oauth_google_credentials')
      .eq('id', profile.center_id)
      .single();

    if (centerError || !center?.oauth_google_client_id || !center?.oauth_google_credentials) {
      console.error('[OAUTH:ERROR] Missing Google OAuth credentials in center:', centerError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=no_credentials`);
    }

    // Decrypt the client secret
    const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
    if (!encryptionKey) {
      console.error('[OAUTH:ERROR] Missing CERTIFICATE_ENCRYPTION_KEY');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=config_error`);
    }

    let clientSecret: string;
    try {
      clientSecret = await decryptAES256GCM(center.oauth_google_credentials, encryptionKey);
    } catch (decryptError) {
      console.error('[OAUTH:ERROR] Failed to decrypt Google credentials:', decryptError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=decrypt_error`);
    }

    const clientId = center.oauth_google_client_id;

    console.log('[OAUTH] Using Google credentials from database for center:', profile.center_id);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('[OAUTH] Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('[OAUTH:ERROR] Token exchange error:', tokenData);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=token_error`);
    }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    console.log('[OAUTH] Google user info:', userInfo.email);

    // FIX 1: Get existing connection to preserve refresh_token and google_calendar_id
    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('refresh_token, google_calendar_id')
      .eq('professional_id', professional_id)
      .eq('provider', 'google')
      .maybeSingle();

    console.log('[OAUTH] Existing connection:', existingConnection ? {
      has_refresh_token: !!existingConnection.refresh_token,
      has_calendar_id: !!existingConnection.google_calendar_id,
    } : 'none');

    // Save to database
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Build upsert data - preserve existing values if not provided by Google
    const upsertData: Record<string, any> = {
      professional_id,
      provider: 'google',
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      scope: tokenData.scope,
      provider_account_id: userInfo.email,
      // Reset sync_token for full resync on reconnection
      sync_token: null,
      needs_reconnect: false,
      updated_at: new Date().toISOString(),
    };

    // Only update refresh_token if Google provided a new one
    // Otherwise preserve the existing one (Google doesn't always send it on re-auth)
    if (tokenData.refresh_token) {
      upsertData.refresh_token = tokenData.refresh_token;
      console.log('[OAUTH] Using new refresh_token from Google');
    } else if (existingConnection?.refresh_token) {
      upsertData.refresh_token = existingConnection.refresh_token;
      console.log('[OAUTH] Preserving existing refresh_token (Google did not send new one)');
    }

    // CRITICAL: DO NOT touch google_calendar_id - preserve user's calendar selection
    // The user selects their calendar in the UI, and we should never overwrite it here
    if (existingConnection?.google_calendar_id) {
      upsertData.google_calendar_id = existingConnection.google_calendar_id;
      console.log('[OAUTH] Preserving existing google_calendar_id:', existingConnection.google_calendar_id);
    }

    // DO NOT update last_sync_status - let sync-google-calendar handle that

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert(upsertData, {
        onConflict: 'professional_id,provider',
      });

    if (upsertError) {
      console.error('[OAUTH:ERROR] Database error:', upsertError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=db_error`);
    }

    console.log('[OAUTH:SUCCESS] Google OAuth success for:', userInfo.email);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=success&provider=google`);

  } catch (error) {
    console.error('[OAUTH:ERROR] OAuth callback error:', error);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=unknown_error`);
  }
});

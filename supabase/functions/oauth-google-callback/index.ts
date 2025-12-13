import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM decryption
async function decryptAES256GCM(encryptedData: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Extract IV (12 bytes), AuthTag (16 bytes), and ciphertext
  const iv = encryptedBytes.slice(0, 12);
  const authTag = encryptedBytes.slice(12, 28);
  const ciphertext = encryptedBytes.slice(28);
  
  // Combine ciphertext and authTag for Web Crypto API
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(authTag, ciphertext.length);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
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
    
    console.log('Google OAuth callback received', { code: !!code, state, error });

    if (error) {
      console.error('Google OAuth error:', error);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.error('Missing code or state');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=missing_params`);
    }

    // Decode state to get professional_id
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Invalid state:', e);
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
      console.error('Could not get professional center:', profileError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=no_center`);
    }

    // Get OAuth credentials from center
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('oauth_google_client_id, oauth_google_credentials')
      .eq('id', profile.center_id)
      .single();

    if (centerError || !center?.oauth_google_client_id || !center?.oauth_google_credentials) {
      console.error('Missing Google OAuth credentials in center:', centerError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=no_credentials`);
    }

    // Decrypt the client secret
    const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
    if (!encryptionKey) {
      console.error('Missing CERTIFICATE_ENCRYPTION_KEY');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=config_error`);
    }

    let clientSecret: string;
    try {
      clientSecret = await decryptAES256GCM(center.oauth_google_credentials, encryptionKey);
    } catch (decryptError) {
      console.error('Failed to decrypt Google credentials:', decryptError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=decrypt_error`);
    }

    const clientId = center.oauth_google_client_id;

    console.log('Using Google credentials from database for center:', profile.center_id);

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
    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokenData);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=token_error`);
    }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    console.log('Google user info:', userInfo.email);

    // Get primary calendar ID
    let calendarId = 'primary';
    try {
      const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        calendarId = calendarData.id;
      }
    } catch (e) {
      console.log('Could not get calendar ID, using primary');
    }

    // Save to database
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        professional_id,
        provider: 'google',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        scope: tokenData.scope,
        provider_account_id: userInfo.email,
        google_calendar_id: calendarId,
      }, {
        onConflict: 'professional_id,provider',
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=db_error`);
    }

    console.log('Google OAuth success for:', userInfo.email);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=success&provider=google`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=google&message=unknown_error`);
  }
});

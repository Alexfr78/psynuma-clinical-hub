import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    console.log('Zoom OAuth callback received', { code: !!code, state, error });

    if (error) {
      console.error('Zoom OAuth error:', error);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.error('Missing code or state');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=missing_params`);
    }

    // Decode state to get professional_id
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Invalid state:', e);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=invalid_state`);
    }

    const { professional_id, redirect_uri } = stateData;

    const clientId = Deno.env.get('ZOOM_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET') || '';
    const credentials = btoa(`${clientId}:${clientSecret}`);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirect_uri,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokenData);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=token_error`);
    }

    // Get user info
    const userInfoResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    console.log('Zoom user info:', userInfo.email);

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        professional_id,
        provider: 'zoom',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        scope: tokenData.scope,
        provider_account_id: userInfo.email || userInfo.id,
      }, {
        onConflict: 'professional_id,provider',
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=db_error`);
    }

    console.log('Zoom OAuth success for:', userInfo.email);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=success&provider=zoom`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=zoom&message=unknown_error`);
  }
});

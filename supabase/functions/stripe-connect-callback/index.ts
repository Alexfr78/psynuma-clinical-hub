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
    const errorDescription = url.searchParams.get('error_description');
    
    console.log('Stripe Connect callback received', { code: !!code, state, error });

    if (error) {
      console.error('Stripe Connect error:', error, errorDescription);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code || !state) {
      console.error('Missing code or state');
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=missing_params`);
    }

    // Decode state to get professional_id
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Invalid state:', e);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=invalid_state`);
    }

    const { professional_id } = stateData;

    // Exchange code for Stripe account info
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    
    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_secret: stripeSecretKey,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok || tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=token_error`);
    }

    // Get account details to check status
    const accountResponse = await fetch(`https://api.stripe.com/v1/accounts/${tokenData.stripe_user_id}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const accountData = await accountResponse.json();
    console.log('Stripe account:', tokenData.stripe_user_id, 'charges_enabled:', accountData.charges_enabled);

    // Determine account status
    let accountStatus: 'pending' | 'active' | 'restricted' = 'pending';
    if (accountData.charges_enabled && accountData.payouts_enabled) {
      accountStatus = 'active';
    } else if (accountData.requirements?.disabled_reason) {
      accountStatus = 'restricted';
    }

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        professional_id,
        provider: 'stripe',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        provider_account_id: accountData.email || tokenData.stripe_user_id,
        stripe_account_id: tokenData.stripe_user_id,
        stripe_account_status: accountStatus,
      }, {
        onConflict: 'professional_id,provider',
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=db_error`);
    }

    console.log('Stripe Connect success, account:', tokenData.stripe_user_id, 'status:', accountStatus);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=success&provider=stripe`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return Response.redirect(`${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=error&provider=stripe&message=unknown_error`);
  }
});

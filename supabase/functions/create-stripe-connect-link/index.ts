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
    const { professional_id } = await req.json();
    
    console.log('Creating Stripe Connect link for professional:', professional_id);

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decode the JWT manually (signing-keys tokens are not verifiable via auth.getUser here)
    const authorization = req.headers.get('Authorization') || '';
    let requesterId: string | null = null;
    try {
      const token = authorization.replace(/^Bearer\s+/i, '');
      if (token) {
        const payload = JSON.parse(
          atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now())) {
          requesterId = payload.sub as string;
        }
      }
    } catch (_e) {
      requesterId = null;
    }

    if (!requesterId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get professional's center and Stripe credentials
    const { data: profile } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', professional_id)
      .single();

    const [{ data: requesterProfile }, { data: requesterRoles }] = await Promise.all([
      supabase.from('profiles').select('center_id').eq('id', authData.user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', authData.user.id),
    ]);
    const isAdmin = (requesterRoles || []).some((row: { role: string }) => row.role === 'admin');
    if (
      !profile?.center_id
      || requesterProfile?.center_id !== profile.center_id
      || (authData.user.id !== professional_id && !isAdmin)
    ) {
      return new Response(
        JSON.stringify({ error: 'Not authorized for this professional' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.center_id) {
      console.error('No center found for professional');
      return new Response(
        JSON.stringify({ error: 'No center found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Stripe Connect onboarding, Checkout and webhooks must use the same
    // platform account. Per-center secret keys are intentionally ignored.
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
      console.error('Invalid Stripe secret key format');
      return new Response(
        JSON.stringify({ error: 'Stripe platform is not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using Stripe platform credentials');

    // Check if account already exists
    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('stripe_account_id, stripe_account_status')
      .eq('professional_id', professional_id)
      .eq('provider', 'stripe')
      .maybeSingle();

    let stripeAccountId = existingConnection?.stripe_account_id;

    // If no account exists, create one
    if (!stripeAccountId) {
      console.log('Creating new Stripe Connect account');
      
      const createAccountResponse = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          type: 'express',
          'capabilities[card_payments][requested]': 'true',
          'capabilities[transfers][requested]': 'true',
        }),
      });

      const accountData = await createAccountResponse.json();
      
      if (!createAccountResponse.ok) {
        console.error('Failed to create Stripe account:', accountData);
        return new Response(
          JSON.stringify({ error: accountData.error?.message || 'Failed to create Stripe account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      stripeAccountId = accountData.id;
      console.log('Created Stripe account:', stripeAccountId);

      // Save to database
      await supabase
        .from('oauth_connections')
        .upsert({
          professional_id,
          provider: 'stripe',
          stripe_account_id: stripeAccountId,
          stripe_account_status: 'pending',
        }, {
          onConflict: 'professional_id,provider',
        });
    }

    // Create account link for onboarding. Redirects are built from the trusted
    // application base URL rather than values supplied by the browser.
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || Deno.env.get('SITE_URL') || 'https://psycma.lovable.app';
    const accountLinkResponse = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: stripeAccountId,
        refresh_url: `${appBaseUrl}/configuracion?oauth=refresh&provider=stripe`,
        return_url: `${appBaseUrl}/configuracion?oauth=success&provider=stripe`,
        type: 'account_onboarding',
      }),
    });

    const linkData = await accountLinkResponse.json();

    if (!accountLinkResponse.ok) {
      console.error('Failed to create account link:', linkData);
      return new Response(
        JSON.stringify({ error: linkData.error?.message || 'Failed to create onboarding link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created Stripe onboarding link for account:', stripeAccountId);

    return new Response(
      JSON.stringify({ url: linkData.url, account_id: stripeAccountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating Stripe Connect link:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

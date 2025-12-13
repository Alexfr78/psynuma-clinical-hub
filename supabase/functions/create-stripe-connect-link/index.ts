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
    const { professional_id, return_url, refresh_url } = await req.json();
    
    console.log('Creating Stripe Connect link for professional:', professional_id);

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if account already exists
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
          JSON.stringify({ error: 'Failed to create Stripe account' }),
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

    // Create account link for onboarding
    const accountLinkResponse = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: stripeAccountId,
        refresh_url: refresh_url || `${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=refresh&provider=stripe`,
        return_url: return_url || `${Deno.env.get('SITE_URL') || 'https://psycma.lovable.app'}/configuracion?oauth=success&provider=stripe`,
        type: 'account_onboarding',
      }),
    });

    const linkData = await accountLinkResponse.json();

    if (!accountLinkResponse.ok) {
      console.error('Failed to create account link:', linkData);
      return new Response(
        JSON.stringify({ error: 'Failed to create onboarding link' }),
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

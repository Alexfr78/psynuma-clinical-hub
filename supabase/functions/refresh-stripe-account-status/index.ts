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
    
    console.log('Refreshing Stripe account status for professional:', professional_id);

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing connection
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('stripe_account_id')
      .eq('professional_id', professional_id)
      .eq('provider', 'stripe')
      .maybeSingle();

    if (!connection?.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe account found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get account details from Stripe
    const accountResponse = await fetch(`https://api.stripe.com/v1/accounts/${connection.stripe_account_id}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const accountData = await accountResponse.json();

    if (!accountResponse.ok) {
      console.error('Failed to get Stripe account:', accountData);
      return new Response(
        JSON.stringify({ error: 'Failed to get account status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine account status
    let accountStatus: 'pending' | 'active' | 'restricted' | 'disabled' = 'pending';
    if (accountData.charges_enabled && accountData.payouts_enabled) {
      accountStatus = 'active';
    } else if (accountData.requirements?.disabled_reason) {
      accountStatus = 'restricted';
    }

    // Update database
    const { error: updateError } = await supabase
      .from('oauth_connections')
      .update({
        stripe_account_status: accountStatus,
        provider_account_id: accountData.email || connection.stripe_account_id,
      })
      .eq('professional_id', professional_id)
      .eq('provider', 'stripe');

    if (updateError) {
      console.error('Database update error:', updateError);
    }

    console.log('Updated Stripe account status:', accountStatus);

    return new Response(
      JSON.stringify({ 
        status: accountStatus,
        charges_enabled: accountData.charges_enabled,
        payouts_enabled: accountData.payouts_enabled,
        requirements: accountData.requirements,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error refreshing Stripe status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

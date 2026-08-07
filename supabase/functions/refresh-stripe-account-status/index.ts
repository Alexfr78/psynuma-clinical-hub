import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authorization = req.headers.get('Authorization') || '';
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
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
      return new Response(
        JSON.stringify({ error: 'No center found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
      console.error('Invalid Stripe secret key format after decryption');
      return new Response(
        JSON.stringify({ error: 'Stripe platform is not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
        JSON.stringify({ error: accountData.error?.message || 'Failed to get account status' }),
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
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

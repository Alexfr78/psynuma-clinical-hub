import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt AES-GCM encrypted secret
async function decryptSecret(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
  
  if (!encryptionKey || !encryptedData) {
    // Fallback for base64 encoded (legacy)
    try {
      return atob(encryptedData);
    } catch {
      return encryptedData;
    }
  }
  
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertextWithTag = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertextWithTag
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed, trying base64 fallback:', error);
    try {
      return atob(encryptedData);
    } catch {
      return encryptedData;
    }
  }
}

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get professional's center and Stripe credentials
    const { data: profile } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', professional_id)
      .single();

    if (!profile?.center_id) {
      console.error('No center found for professional');
      return new Response(
        JSON.stringify({ error: 'No center found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Stripe credentials from center
    const { data: center } = await supabase
      .from('centers')
      .select('oauth_stripe_credentials')
      .eq('id', profile.center_id)
      .single();

    if (!center?.oauth_stripe_credentials) {
      console.error('Stripe credentials not configured for center');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured. Please add Stripe credentials in Settings > Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the secret key
    const stripeSecretKey = await decryptSecret(center.oauth_stripe_credentials);
    
    if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
      console.error('Invalid Stripe secret key format');
      return new Response(
        JSON.stringify({ error: 'Invalid Stripe secret key. Please update in Settings > Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using Stripe secret key from center configuration');

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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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

    // Get professional's center and Stripe credentials
    const { data: profile } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', professional_id)
      .single();

    if (!profile?.center_id) {
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
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the secret key
    const stripeSecretKey = await decryptSecret(center.oauth_stripe_credentials);
    
    if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_')) {
      console.error('Invalid Stripe secret key format after decryption');
      return new Response(
        JSON.stringify({ error: 'Invalid Stripe secret key. Please update in Settings > Integrations.' }),
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

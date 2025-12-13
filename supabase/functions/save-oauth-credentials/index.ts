import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Solo administradores pueden modificar credenciales' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { provider, credentials } = await req.json();

    if (!provider || !credentials) {
      return new Response(JSON.stringify({ error: 'Missing provider or credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's center_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', user.id)
      .single();

    if (!profile?.center_id) {
      return new Response(JSON.stringify({ error: 'No center found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Encrypt and store credentials in a center-level table
    // For now, we store in a simple structure - in production you'd want proper encryption
    const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
    
    let encryptedCredentials: string;
    if (encryptionKey) {
      // Use same encryption as Verifactu certificates
      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const dataToEncrypt = encoder.encode(JSON.stringify(credentials));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataToEncrypt
      );
      
      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      
      encryptedCredentials = btoa(String.fromCharCode(...combined));
    } else {
      // Fallback - base64 encode (not secure, but works for development)
      encryptedCredentials = btoa(JSON.stringify(credentials));
    }

    // Store in center_oauth_credentials table or as JSON in centers table
    // Using a dedicated column approach per provider
    const updateData: Record<string, string> = {};
    
    switch (provider) {
      case 'google':
        updateData['oauth_google_credentials'] = encryptedCredentials;
        break;
      case 'zoom':
        updateData['oauth_zoom_credentials'] = encryptedCredentials;
        break;
      case 'stripe':
        updateData['oauth_stripe_credentials'] = encryptedCredentials;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid provider' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const { error: updateError } = await supabase
      .from('centers')
      .update(updateData)
      .eq('id', profile.center_id);

    if (updateError) {
      console.error('Error saving credentials:', updateError);
      return new Response(JSON.stringify({ error: 'Error al guardar credenciales' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`OAuth credentials saved for provider: ${provider}, center: ${profile.center_id}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in save-oauth-credentials:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

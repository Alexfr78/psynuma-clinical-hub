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

    // Encrypt sensitive data (secrets only)
    const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
    
    const encryptSecret = async (secret: string): Promise<string> => {
      if (!secret) return '';
      
      if (encryptionKey) {
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
        const dataToEncrypt = encoder.encode(secret);
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          dataToEncrypt
        );
        
        // Combine IV + encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        return btoa(String.fromCharCode(...combined));
      } else {
        // Fallback - base64 encode (not secure, but works for development)
        return btoa(secret);
      }
    };

    // Build update data based on provider
    const updateData: Record<string, string | null> = {};
    
    switch (provider) {
      case 'google':
        // Store client_id in plaintext, encrypt client_secret
        if (credentials.clientId) {
          updateData['oauth_google_client_id'] = credentials.clientId;
        }
        if (credentials.clientSecret) {
          updateData['oauth_google_credentials'] = await encryptSecret(credentials.clientSecret);
        }
        break;
      case 'zoom':
        // Store client_id in plaintext, encrypt client_secret
        if (credentials.clientId) {
          updateData['oauth_zoom_client_id'] = credentials.clientId;
        }
        if (credentials.clientSecret) {
          updateData['oauth_zoom_credentials'] = await encryptSecret(credentials.clientSecret);
        }
        break;
      case 'stripe':
        // Store publishable key in plaintext, encrypt secret key
        if (credentials.publishableKey) {
          updateData['oauth_stripe_publishable_key'] = credentials.publishableKey;
        }
        if (credentials.secretKey) {
          updateData['oauth_stripe_credentials'] = await encryptSecret(credentials.secretKey);
        }
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid provider' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ error: 'No credentials provided' }), {
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

    console.log(`OAuth credentials saved for provider: ${provider}, center: ${profile.center_id}, fields: ${Object.keys(updateData).join(', ')}`);

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

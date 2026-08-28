import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/crypto.ts";

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
      case 'google_drive':
        // Separate OAuth client from Calendar/Meet's 'google' — narrower
        // drive.file scope, connected per-center rather than per-professional.
        if (credentials.clientId) {
          updateData['oauth_google_drive_client_id'] = credentials.clientId;
        }
        if (credentials.clientSecret) {
          updateData['oauth_google_drive_credentials'] = await encryptSecret(credentials.clientSecret);
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
      case 'whatsapp':
        // Encrypt access token, store phone/account IDs in plaintext
        if (credentials.accessToken) {
          updateData['whatsapp_access_token'] = await encryptSecret(credentials.accessToken);
        }
        if (credentials.phoneNumberId !== undefined) {
          updateData['whatsapp_phone_number_id'] = credentials.phoneNumberId || null;
        }
        if (credentials.businessAccountId !== undefined) {
          updateData['whatsapp_business_account_id'] = credentials.businessAccountId || null;
        }
        if (credentials.sendMethod !== undefined) {
          updateData['whatsapp_send_method'] = credentials.sendMethod || null;
        }
        break;
      case 'openai':
        if (credentials.apiKey) {
          updateData['openai_api_key_encrypted'] = await encryptSecret(credentials.apiKey);
        }
        break;
      case 'gemini':
        if (credentials.apiKey) {
          updateData['gemini_api_key_encrypted'] = await encryptSecret(credentials.apiKey);
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
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

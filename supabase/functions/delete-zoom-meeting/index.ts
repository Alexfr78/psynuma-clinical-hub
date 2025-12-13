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
    const { professional_id, meeting_id } = await req.json();

    console.log('Deleting Zoom meeting:', meeting_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OAuth connection
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professional_id)
      .eq('provider', 'zoom')
      .single();

    if (!connection) {
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete meeting (ignoring errors as meeting may already be deleted)
    const deleteResponse = await fetch(
      `https://api.zoom.us/v2/meetings/${meeting_id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${connection.access_token}` },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.log('Zoom delete response:', deleteResponse.status);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: true, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

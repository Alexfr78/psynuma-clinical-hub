import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { callerErrorResponse, canActOnCenter, resolveCaller } from "../_shared/requireCaller.ts";

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

    const caller = await resolveCaller(req, supabase as unknown as Parameters<typeof resolveCaller>[1]);
    if (!caller) return callerErrorResponse(401, corsHeaders);
    if (caller.kind === 'user') {
      // Los ids de reunión de Zoom son solo dígitos. Se valida antes de usarlo
      // dentro del filtro .or() de PostgREST, que se construye como texto.
      if (!/^\d{6,15}$/.test(String(meeting_id))) return callerErrorResponse(403, corsHeaders);
      const { data: profile } = await supabase.from('profiles').select('center_id').eq('id', professional_id).maybeSingle();
      const { data: centerRole } = await supabase.from('user_roles').select('user_id')
        .eq('user_id', caller.userId).eq('center_id', caller.centerId)
        .in('role', ['admin', 'professional']).limit(1).maybeSingle();
      const { data: session } = await supabase.from('sessions').select('center_id, professional_id')
        .eq("center_id", caller.centerId)
        .or(`zoom_meeting_id.eq.${String(meeting_id)},video_call_link.like.%/j/${String(meeting_id)}%`).limit(1).maybeSingle();
      if (!profile || !centerRole || !canActOnCenter(caller, profile.center_id) ||
        !session || session.center_id !== profile.center_id || session.professional_id !== professional_id) return callerErrorResponse(403, corsHeaders);
    }

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

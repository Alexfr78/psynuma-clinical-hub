import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret for scheduled invocations
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');
    
    // Allow both service role key and cron secret
    const isAuthorized = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '') ||
                         authHeader?.includes(cronSecret || '');
    
    if (!isAuthorized && cronSecret) {
      console.log('Unauthorized cron request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[CRON] Starting patient status recalculation...');

    // Get all patients that are not manually discharged
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('id, status, status_source')
      .or('status_source.is.null,status_source.eq.auto,and(status.neq.discharged,status_source.eq.manual)');

    if (patientsError) {
      throw patientsError;
    }

    console.log(`[CRON] Found ${patients?.length || 0} patients to process`);

    let updated = 0;
    let errors = 0;

    // Process each patient
    for (const patient of patients || []) {
      // Skip manually discharged patients
      if (patient.status === 'discharged' && patient.status_source === 'manual') {
        continue;
      }

      try {
        const { data, error } = await supabase
          .rpc('compute_patient_status', { p_patient_id: patient.id });

        if (error) {
          console.error(`[CRON] Error processing patient ${patient.id}:`, error);
          errors++;
        } else if ((data as { changed?: boolean })?.changed) {
          updated++;
          console.log(`[CRON] Updated patient ${patient.id}:`, data);
        }
      } catch (err) {
        console.error(`[CRON] Exception processing patient ${patient.id}:`, err);
        errors++;
      }
    }

    const result = {
      success: true,
      processed: patients?.length || 0,
      updated,
      errors,
      timestamp: new Date().toISOString(),
    };

    console.log('[CRON] Completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

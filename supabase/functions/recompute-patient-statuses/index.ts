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
    // This function is meant to be called by cron jobs or manually
    // No auth required since it only recalculates statuses based on existing data
    console.log('[CRON] Received request to recompute patient statuses');

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
    console.error("[recompute-patient-statuses] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

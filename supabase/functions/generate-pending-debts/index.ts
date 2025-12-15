import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting debt generation for unpaid past sessions...');

    // Get all past sessions with pending payment that don't have a debt yet
    // Exclude cancelled, no_show, blocked sessions and sessions with price = 0
    const { data: unpaidSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, patient_id, center_id, session_date, price')
      .lt('session_date', new Date().toISOString().split('T')[0])
      .eq('payment_status', 'pending')
      .not('status', 'in', '("cancelled","no_show","blocked")')
      .gt('price', 0);

    if (sessionsError) {
      console.error('Error fetching unpaid sessions:', sessionsError);
      throw sessionsError;
    }

    console.log(`Found ${unpaidSessions?.length || 0} unpaid past sessions`);

    if (!unpaidSessions || unpaidSessions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No unpaid sessions found',
          created: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing debts for these sessions to avoid duplicates
    const sessionIds = unpaidSessions.map(s => s.id);
    const { data: existingDebts, error: debtsError } = await supabase
      .from('debts')
      .select('session_id')
      .in('session_id', sessionIds);

    if (debtsError) {
      console.error('Error fetching existing debts:', debtsError);
      throw debtsError;
    }

    const existingSessionIds = new Set(existingDebts?.map(d => d.session_id) || []);
    console.log(`Found ${existingSessionIds.size} sessions already have debts`);

    // Filter sessions that don't have debts yet
    const sessionsNeedingDebt = unpaidSessions.filter(s => !existingSessionIds.has(s.id));
    console.log(`Creating debts for ${sessionsNeedingDebt.length} sessions`);

    if (sessionsNeedingDebt.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All unpaid sessions already have debts',
          created: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create debts for each session
    const debtsToInsert = sessionsNeedingDebt.map(session => ({
      patient_id: session.patient_id,
      center_id: session.center_id,
      session_id: session.id,
      amount: session.price,
      paid_amount: 0,
      status: 'pending',
      due_date: session.session_date,
      notes: `Deuda generada automáticamente para sesión del ${session.session_date}`,
    }));

    const { data: createdDebts, error: insertError } = await supabase
      .from('debts')
      .insert(debtsToInsert)
      .select();

    if (insertError) {
      console.error('Error creating debts:', insertError);
      throw insertError;
    }

    console.log(`Successfully created ${createdDebts?.length || 0} debts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${createdDebts?.length || 0} debts`,
        created: createdDebts?.length || 0,
        sessions: sessionsNeedingDebt.map(s => s.id)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-pending-debts:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

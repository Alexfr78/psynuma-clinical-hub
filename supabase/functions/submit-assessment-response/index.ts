import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-assessment-token',
};

interface ScoringFactor {
  items: number[];
  label: string;
}

interface Scoring {
  [key: string]: ScoringFactor;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, answers } = await req.json();

    if (!token) {
      console.error('No token provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Token requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!answers || typeof answers !== 'object') {
      console.error('No answers provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Respuestas requeridas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find assessment by token
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select(`
        id,
        status,
        expires_at,
        template:assessment_templates(
          id,
          items,
          scoring
        )
      `)
      .eq('access_token', token)
      .single();

    if (assessmentError || !assessment) {
      console.error('Assessment not found:', assessmentError);
      return new Response(
        JSON.stringify({ success: false, error: 'Evaluación no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already completed
    if (assessment.status === 'completed') {
      console.log('Assessment already completed');
      return new Response(
        JSON.stringify({ success: false, error: 'Esta evaluación ya fue completada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if expired
    if (new Date(assessment.expires_at) < new Date()) {
      console.log('Assessment expired');
      return new Response(
        JSON.stringify({ success: false, error: 'El enlace ha caducado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if revoked
    if (assessment.status === 'revoked') {
      console.log('Assessment revoked');
      return new Response(
        JSON.stringify({ success: false, error: 'Esta evaluación ha sido revocada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const template = assessment.template as unknown as { id: string; items: { index: number; text: string }[]; scoring: Scoring };
    
    if (!template) {
      console.error('Template not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Plantilla no encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = template.items;
    const scoring = template.scoring;

    // Validate all items are answered with valid values (1-7)
    const expectedItems = items.map(i => i.index);
    const answeredItems = Object.keys(answers).map(k => parseInt(k, 10));
    
    const missingItems = expectedItems.filter(i => !answeredItems.includes(i));
    if (missingItems.length > 0) {
      console.error('Missing items:', missingItems);
      return new Response(
        JSON.stringify({ success: false, error: `Faltan respuestas para los ítems: ${missingItems.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate values are 1-7
    for (const [key, value] of Object.entries(answers)) {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue < 1 || numValue > 7) {
        console.error(`Invalid value for item ${key}:`, value);
        return new Response(
          JSON.stringify({ success: false, error: `Valor inválido para el ítem ${key}. Debe ser entre 1 y 7.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate factor scores
    const factorScores: Record<string, number> = {};
    const flags: Record<string, boolean> = {};

    for (const [factorCode, factor] of Object.entries(scoring)) {
      const factorItems = factor.items;
      let sum = 0;
      for (const itemIndex of factorItems) {
        const value = typeof answers[itemIndex] === 'number' 
          ? answers[itemIndex] 
          : parseInt(answers[itemIndex], 10);
        sum += value;
      }
      const mean = sum / factorItems.length;
      factorScores[factorCode] = Math.round(mean * 100) / 100; // 2 decimals
      
      // Flag if score > 4
      if (factorScores[factorCode] > 4) {
        flags[`${factorCode}_high`] = true;
      }
    }

    console.log('Calculated factor scores:', factorScores);
    console.log('Flags:', flags);

    // Get user agent for metadata
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Insert response
    const { error: insertError } = await supabase
      .from('assessment_responses')
      .insert({
        assessment_id: assessment.id,
        answers,
        factor_scores: factorScores,
        flags: Object.keys(flags).length > 0 ? flags : null,
        metadata: { userAgent, submittedAt: new Date().toISOString() }
      });

    if (insertError) {
      console.error('Error inserting response:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al guardar las respuestas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update assessment status
    const { error: updateError } = await supabase
      .from('assessments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', assessment.id);

    if (updateError) {
      console.error('Error updating assessment status:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al actualizar el estado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Assessment completed successfully:', assessment.id);

    return new Response(
      JSON.stringify({ success: true, factorScores }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing assessment response:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

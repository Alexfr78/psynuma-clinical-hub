import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage } from "../_shared/adminAlerts.ts";

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

interface TemplateData {
  id: string;
  code: string;
  items: { index: number; text: string }[];
  scoring: Scoring;
  response_min: number;
  response_max: number;
  flag_threshold: number;
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

    // Find assessment by token - now includes template settings
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select(`
        id,
        status,
        expires_at,
        template:assessment_templates(
          id,
          code,
          items,
          scoring,
          response_min,
          response_max,
          flag_threshold
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

    const template = assessment.template as unknown as TemplateData;
    
    if (!template) {
      console.error('Template not found');
      return new Response(
        JSON.stringify({ success: false, error: 'Plantilla no encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = Array.isArray(template.items) ? template.items : [];

    // scoring can be null or malformed depending on how template JSON was saved.
    // Normalize it to a plain object of factors.
    const scoringRaw: unknown = (template as any).scoring;
    const scoring: Record<string, any> =
      scoringRaw && typeof scoringRaw === 'object' && !Array.isArray(scoringRaw)
        ? (scoringRaw as Record<string, any>)
        : {};

    const responseMin = template.response_min ?? 1;
    const responseMax = template.response_max ?? 7;
    const flagThreshold = template.flag_threshold ?? 4;
    const isSCL90 = template.code === 'SCL90_V1';
    const isPAI = template.code === 'PAI_V1';

    console.log(
      `Processing ${template.code} assessment with response range ${responseMin}-${responseMax} (items=${items.length}, scales=${Object.keys(scoring).length})`
    );

    // Validate all items are answered
    const expectedItems = items.map((i) => i.index);
    const answeredItems = Object.keys(answers).map((k) => parseInt(k, 10));

    const missingItems = expectedItems.filter((i) => !answeredItems.includes(i));
    if (missingItems.length > 0) {
      console.error('Missing items:', missingItems);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Faltan respuestas para los ítems: ${missingItems.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate values are within template range
    for (const [key, value] of Object.entries(answers)) {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue < responseMin || numValue > responseMax) {
        console.error(`Invalid value for item ${key}:`, value);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Valor inválido para el ítem ${key}. Debe ser entre ${responseMin} y ${responseMax}.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Calculate factor scores
    const factorScores: Record<string, number> = {};
    const flags: Record<string, boolean> = {};

    // For PAI, we calculate raw scores and convert to T-scores
    // For other tests, we use mean scores
    for (const [factorCode, factorValue] of Object.entries(scoring)) {
      const factorItems = (factorValue as any)?.items;
      if (!Array.isArray(factorItems) || factorItems.length === 0) {
        // Skip scales without a proper item list (common in templates like MMPI2RF)
        continue;
      }

      let sum = 0;
      for (const itemIndex of factorItems) {
        const raw = (answers as any)[itemIndex];
        const value = typeof raw === 'number' ? raw : parseInt(raw, 10);
        sum += value;
      }

      if (isPAI) {
        // PAI: Calculate raw score (sum) and convert to T-score
        const rawScore = sum;
        // Simplified T-score conversion: T = 50 + 10 * ((raw - mean) / sd)
        // Using approximate norms: mean ≈ 50% of max, sd ≈ 10% of max
        const maxPossible = factorItems.length * responseMax;
        const expectedMean = maxPossible * 0.35; // Clinical population approximation
        const expectedSd = maxPossible * 0.15;
        const tScore = Math.round(50 + 10 * ((rawScore - expectedMean) / expectedSd));
        // Clamp T-score to valid range
        factorScores[factorCode] = Math.min(100, Math.max(30, tScore));

        // PAI uses T ≥ 65 as clinical threshold
        if (factorScores[factorCode] >= 65) {
          flags[`${factorCode}_high`] = true;
        }
        // Critical scales get special flags
        const criticalScales = ['SUI', 'AGG-P', 'SCZ-P', 'BOR-S'];
        if (criticalScales.includes(factorCode) && factorScores[factorCode] >= 70) {
          flags[`${factorCode}_critical`] = true;
        }
      } else {
        // Default: Mean score for non-PAI tests
        const mean = sum / factorItems.length;
        factorScores[factorCode] = Math.round(mean * 100) / 100; // 2 decimals

        // Flag if score > threshold
        if (factorScores[factorCode] > flagThreshold) {
          flags[`${factorCode}_high`] = true;
        }
      }
    }

    // For SCL-90-R, calculate global indices
    if (isSCL90) {
      // GSI (Global Severity Index) = mean of all 90 items
      let totalSum = 0;
      let positiveCount = 0; // PST - count of items > 0
      let positiveSum = 0; // sum of items > 0 for PSDI

      for (const item of items) {
        const value = typeof answers[item.index] === 'number' 
          ? answers[item.index] 
          : parseInt(answers[item.index], 10);
        totalSum += value;
        if (value > 0) {
          positiveCount++;
          positiveSum += value;
        }
      }

      // GSI: Global Severity Index (use actual item count for safety)
      factorScores['GSI'] = Math.round((totalSum / items.length) * 100) / 100;
      
      // PST: Positive Symptom Total (count of items > 0)
      factorScores['PST'] = positiveCount;
      
      // PSDI: Positive Symptom Distress Index (mean of positive items)
      factorScores['PSDI'] = positiveCount > 0 
        ? Math.round((positiveSum / positiveCount) * 100) / 100 
        : 0;

      // Flag global indices if needed
      if (factorScores['GSI'] > flagThreshold) {
        flags['GSI_high'] = true;
      }
      
      console.log('SCL-90-R Global indices:', {
        GSI: factorScores['GSI'],
        PST: factorScores['PST'],
        PSDI: factorScores['PSDI']
      });
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

    // Get assessment details for alert
    const { data: assessmentDetails } = await supabase
      .from('assessments')
      .select('center_id, patient_id, professional_id, template:assessment_templates(name)')
      .eq('id', assessment.id)
      .single();

    if (assessmentDetails) {
      const { data: patientData } = await supabase
        .from('patients')
        .select('first_name, last_name, email')
        .eq('id', assessmentDetails.patient_id)
        .single();

      if (patientData) {
        const templateName = Array.isArray(assessmentDetails.template) 
          ? assessmentDetails.template[0]?.name 
          : (assessmentDetails.template as any)?.name || 'Evaluación';

        const alertMessage = buildAlertMessage({
          eventType: 'Evaluación completada por el paciente',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          testName: templateName,
        });

        await sendAdminAlert({
          supabase,
          centerId: assessmentDetails.center_id,
          eventKey: 'assessment_completed',
          subject: `Evaluación completada — ${patientData.first_name} ${patientData.last_name} — ${templateName}`,
          message: alertMessage,
          patientId: assessmentDetails.patient_id,
          professionalId: assessmentDetails.professional_id,
        });
      }
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
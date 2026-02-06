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
    const { token, answers, examples } = await req.json();

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
    const isBDI2 = template.code === 'BDI2';
    const isDCI = template.code === 'DCI';
    const isDES = template.code === 'DES';
    const isSTAI = template.code === 'STAI';
    const isEMO = template.code === 'EMO';

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

    // SECURITY: Validate values are within template range using Number() for strict parsing
    // parseInt() is insecure: parseInt('10.5') returns 10, parseInt('10abc') returns 10
    for (const [key, value] of Object.entries(answers)) {
      // SECURITY: Only allow numeric keys (item indices)
      const keyNum = Number(key);
      if (!Number.isInteger(keyNum) || keyNum < 0) {
        console.error(`Invalid item key (non-integer):`, key);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Clave de ítem inválida: ${key}. Solo se permiten índices numéricos.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // SECURITY: Use Number() for strict validation - rejects trailing chars and decimals
      const numValue = typeof value === 'number' ? value : Number(value);
      
      // Check for NaN, non-integers, or out-of-range values
      if (!Number.isInteger(numValue) || numValue < responseMin || numValue > responseMax) {
        console.error(`Invalid value for item ${key}:`, value, `(parsed: ${numValue})`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Valor inválido para el ítem ${key}. Debe ser un número entero entre ${responseMin} y ${responseMax}.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // SECURITY: Validate that only expected items are present (no extra fields)
    const answeredKeys = Object.keys(answers).map(k => Number(k));
    const unexpectedItems = answeredKeys.filter(k => !expectedItems.includes(k));
    if (unexpectedItems.length > 0) {
      console.error('Unexpected items in answers:', unexpectedItems);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Se encontraron ítems inesperados: ${unexpectedItems.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Calculate factor scores
    const factorScores: Record<string, number> = {};
    const flags: Record<string, boolean> = {};

    // ===== BDI-II SCORING =====
    // BDI-II uses a simple sum of all 21 items (0-3 each)
    // Total score range: 0-63
    if (isBDI2) {
      let totalSum = 0;
      let cogAffectSum = 0; // Items 1-14
      let somVegSum = 0; // Items 15-21

      for (const item of items) {
        const raw = (answers as any)[item.index];
        const value = typeof raw === 'number' ? raw : parseInt(raw, 10);

        if (!isNaN(value)) {
          totalSum += value;

          // Cognitivo-Afectivo: Items 1-14
          if (item.index >= 1 && item.index <= 14) {
            cogAffectSum += value;
          }
          // Somático-Vegetativo: Items 15-21
          else if (item.index >= 15 && item.index <= 21) {
            somVegSum += value;
          }
        }
      }

      factorScores['TOTAL'] = totalSum;
      factorScores['COG_AFECT'] = cogAffectSum;
      factorScores['SOM_VEG'] = somVegSum;

      // Flags based on cutoffs
      if (totalSum >= 29) {
        flags['TOTAL_grave'] = true;
      } else if (totalSum >= 20) {
        flags['TOTAL_moderada'] = true;
      } else if (totalSum >= 14) {
        flags['TOTAL_leve'] = true;
      }

      // Special flag for item 9 (suicide ideation)
      const item9Value = (answers as any)[9];
      const item9Score = typeof item9Value === 'number' ? item9Value : parseInt(item9Value, 10);
      if (!isNaN(item9Score) && item9Score >= 2) {
        flags['SUICIDIO_alerta'] = true;
        flags['ITEM9_score'] = true; // Store as flag for reference
      }
      // Store item 9 score in factor scores for easy access
      factorScores['ITEM9'] = item9Score;

      console.log('BDI-II scores:', {
        TOTAL: factorScores['TOTAL'],
        COG_AFECT: factorScores['COG_AFECT'],
        SOM_VEG: factorScores['SOM_VEG'],
        ITEM9: factorScores['ITEM9'],
        flags,
      });
    }

    // ===== DCI SCORING =====
    // DCI uses sum of items for each scale
    // Distanciamiento (DET): Items 1, 2, 3, 4, 7, 11, 12, 18, 19, 22
    // Compartimentación (COM): Items 5, 6, 9, 10, 13, 14, 16, 17, 20, 21
    // Validez (VAL): Items 8, 15
    if (isDCI) {
      const detItems = [1, 2, 3, 4, 7, 11, 12, 18, 19, 22];
      const comItems = [5, 6, 9, 10, 13, 14, 16, 17, 20, 21];
      const valItems = [8, 15];

      let detSum = 0;
      let comSum = 0;
      let valSum = 0;

      for (const item of items) {
        const raw = (answers as any)[item.index];
        const value = typeof raw === 'number' ? raw : parseInt(raw, 10);

        if (!isNaN(value)) {
          if (detItems.includes(item.index)) detSum += value;
          if (comItems.includes(item.index)) comSum += value;
          if (valItems.includes(item.index)) valSum += value;
        }
      }

      factorScores['DET'] = detSum;
      factorScores['COM'] = comSum;
      factorScores['VAL'] = valSum;

      // Flags based on cutoffs (17.50 for DET, 9.50 for COM)
      if (detSum >= 18) {
        flags['DET_high'] = true;
      }
      if (comSum >= 10) {
        flags['COM_high'] = true;
      }
      // High validity score may indicate acquiescent responding
      if (valSum >= 10) {
        flags['VAL_warning'] = true;
      }

      console.log('DCI scores:', {
        DET: factorScores['DET'],
        COM: factorScores['COM'],
        VAL: factorScores['VAL'],
        flags,
      });
    }

    // ===== DES SCORING =====
    // DES (Dissociative Experiences Scale) uses mean percentages (0-100%)
    // Total: mean of all 28 items
    // Subscales: DES-A (Amnesia), DES-D (Depersonalization), DES-I (Absorption), DES-T (Taxon)
    if (isDES) {
      const amnesiaItems = [3, 4, 5, 6, 8, 10, 25, 26];
      const depersonItems = [7, 11, 12, 13, 16, 28];
      const absorptionItems = [2, 14, 15, 17, 18, 20];
      const taxonItems = [3, 5, 7, 8, 12, 13, 22, 27];

      let totalSum = 0;
      let amnesiaSum = 0;
      let depersonSum = 0;
      let absorptionSum = 0;
      let taxonSum = 0;

      for (const item of items) {
        const raw = (answers as any)[item.index];
        const value = typeof raw === 'number' ? raw : parseInt(raw, 10);

        if (!isNaN(value)) {
          totalSum += value;
          if (amnesiaItems.includes(item.index)) amnesiaSum += value;
          if (depersonItems.includes(item.index)) depersonSum += value;
          if (absorptionItems.includes(item.index)) absorptionSum += value;
          if (taxonItems.includes(item.index)) taxonSum += value;
        }
      }

      // Calculate means
      factorScores['TOTAL'] = Math.round((totalSum / 28) * 10) / 10;
      factorScores['DES_A'] = Math.round((amnesiaSum / amnesiaItems.length) * 10) / 10;
      factorScores['DES_D'] = Math.round((depersonSum / depersonItems.length) * 10) / 10;
      factorScores['DES_I'] = Math.round((absorptionSum / absorptionItems.length) * 10) / 10;
      factorScores['DES_T'] = Math.round((taxonSum / taxonItems.length) * 10) / 10;

      // Clinical flags based on cutoffs
      if (factorScores['TOTAL'] >= 30) {
        flags['clinical'] = true;
      } else if (factorScores['TOTAL'] >= 20) {
        flags['elevated'] = true;
      }
      if (factorScores['DES_T'] >= 20) {
        flags['taxon_positive'] = true;
      }

      console.log('DES scores:', {
        TOTAL: factorScores['TOTAL'],
        DES_A: factorScores['DES_A'],
        DES_D: factorScores['DES_D'],
        DES_I: factorScores['DES_I'],
        DES_T: factorScores['DES_T'],
        flags,
      });
    }

    // ===== STAI SCORING =====
    // STAI uses sum of 20 items per scale (0-3 each), with some items reversed
    // A_E (Estado): Items 1-20, reversed: 1,2,5,8,10,11,15,16,19,20
    // A_R (Rasgo): Items 21-40, reversed: 21,26,27,30,33,36,39
    if (isSTAI) {
      const aeReversed = [1, 2, 5, 8, 10, 11, 15, 16, 19, 20];
      const arReversed = [21, 26, 27, 30, 33, 36, 39];

      let aeSum = 0;
      let arSum = 0;

      for (const item of items) {
        const raw = (answers as any)[item.index];
        const value = typeof raw === 'number' ? raw : parseInt(raw, 10);

        if (!isNaN(value)) {
          // A_E: Items 1-20
          if (item.index >= 1 && item.index <= 20) {
            const finalValue = aeReversed.includes(item.index) ? (3 - value) : value;
            aeSum += finalValue;
          }
          // A_R: Items 21-40
          else if (item.index >= 21 && item.index <= 40) {
            const finalValue = arReversed.includes(item.index) ? (3 - value) : value;
            arSum += finalValue;
          }
        }
      }

      factorScores['A_E'] = aeSum;
      factorScores['A_R'] = arSum;

      // Flags based on approximate percentile 75 cutoffs
      if (aeSum > 40) flags['A_E_high'] = true;
      else if (aeSum > 30) flags['A_E_moderate'] = true;
      
      if (arSum > 40) flags['A_R_high'] = true;
      else if (arSum > 30) flags['A_R_moderate'] = true;

      console.log('STAI scores:', {
        A_E: factorScores['A_E'],
        A_R: factorScores['A_R'],
        flags,
      });
    }

    // ===== EMO SCORING =====
    // EMO uses qualitative data with category-based tendency counting
    if (isEMO) {
      // Tendency category mappings
      const tendencyCategoryMap: Record<string, string> = {
        'Evito sentir algunas cosas': 'hipoactivacion',
        'Tiendo a suprimir o anular determinadas emociones': 'hipoactivacion',
        'Quisiera sentir más de lo que siento': 'hipoactivacion',
        'Soy poco emocional, o eso me dicen': 'hipoactivacion',
        'Me siento como anestesiado a nivel emocional': 'hipoactivacion',
        'Algunas de mis emociones suelen desbordarse': 'hiperactivacion',
        'Tiendo a contagiarme de las emociones de los demás': 'hiperactivacion',
        'Mis emociones están siempre a flor de piel': 'hiperactivacion',
        'Mis emociones son demasiado intensas': 'hiperactivacion',
        'A veces me vienen emociones que no me parecen mías': 'disregulacion',
        'Puede cambiar de un momento a otro lo que siento': 'disregulacion',
        'En general no sé muy bien lo que siento': 'disregulacion',
        'Me enfado conmigo mismo por sentir determinadas emociones': 'autocritica',
        'A veces me avergüenzo de lo que puedo llegar a sentir': 'autocritica',
        'Siento cosas que no debería de sentir': 'autocritica',
        'Le doy vueltas y vueltas a cómo me siento': 'rumiacion',
        'Trato de controlar mis emociones todo lo que puedo': 'control',
      };

      // Count tendencies by category
      const categoryCounts: Record<string, number> = {
        hipoactivacion: 0,
        hiperactivacion: 0,
        disregulacion: 0,
        autocritica: 0,
        rumiacion: 0,
        control: 0,
      };

      // Get tendencies from answers (items 4 and 5 are checkbox lists)
      const tendencies1 = (answers as any)['4'] || [];
      const tendencies2 = (answers as any)['5'] || [];
      const allTendencies = [...(Array.isArray(tendencies1) ? tendencies1 : []), ...(Array.isArray(tendencies2) ? tendencies2 : [])];

      for (const tendency of allTendencies) {
        const category = tendencyCategoryMap[tendency];
        if (category && categoryCounts[category] !== undefined) {
          categoryCounts[category]++;
        }
      }

      // Set factor scores
      for (const [category, count] of Object.entries(categoryCounts)) {
        factorScores[category] = count;
      }

      // Count problematic emotions (item 3)
      const problematicEmotions = (answers as any)['3'] || [];
      factorScores['problematic_emotions_count'] = Array.isArray(problematicEmotions) ? problematicEmotions.length : 0;

      // Count total tendencies
      factorScores['tendencies_count'] = allTendencies.length;

      // Count positive moments (item 18)
      const positiveMoments = (answers as any)['18'] || [];
      const validMoments = Array.isArray(positiveMoments) 
        ? positiveMoments.filter((m: string) => m && m.trim()).length 
        : 0;
      factorScores['positive_moments_count'] = validMoments;

      // Set flags based on patterns
      if (allTendencies.length >= 10) {
        flags['high_dysregulation'] = true;
      }
      if (categoryCounts.hipoactivacion >= 3) {
        flags['pattern_hypoactivation'] = true;
      }
      if (categoryCounts.hiperactivacion >= 3) {
        flags['pattern_hyperactivation'] = true;
      }
      if (categoryCounts.hipoactivacion >= 2 && categoryCounts.hiperactivacion >= 2) {
        flags['pattern_mixed'] = true;
      }
      if (validMoments === 0) {
        flags['no_positive_moments'] = true;
      }

      console.log('EMO scores:', {
        categories: categoryCounts,
        problematic_emotions: factorScores['problematic_emotions_count'],
        tendencies_total: factorScores['tendencies_count'],
        positive_moments: factorScores['positive_moments_count'],
        flags,
      });
    }

    // For other tests, we use mean scores
    // Skip for tests that already calculated their scores above (BDI2, DCI, DES, STAI, EMO)
    for (const [factorCode, factorValue] of Object.entries(scoring)) {
      // CRITICAL: Skip if this factor was already calculated by a test-specific block
      if (isBDI2 || isDCI || isDES || isSTAI || isEMO) {
        continue;
      }
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

    // Build metadata with examples if provided (for DES)
    const responseMetadata: Record<string, any> = { 
      userAgent, 
      submittedAt: new Date().toISOString() 
    };
    
    // Store examples in metadata for DES assessments
    if (isDES && examples && typeof examples === 'object' && Object.keys(examples).length > 0) {
      responseMetadata.examples = examples;
      responseMetadata.examplesSubmittedAt = new Date().toISOString();
    }

    // Insert response
    const { error: insertError } = await supabase
      .from('assessment_responses')
      .insert({
        assessment_id: assessment.id,
        answers,
        factor_scores: factorScores,
        flags: Object.keys(flags).length > 0 ? flags : null,
        metadata: responseMetadata
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

    // For DES with examples, trigger async AI analysis
    if (isDES && examples && typeof examples === 'object' && Object.keys(examples).length > 0) {
      console.log('Triggering DES examples analysis for assessment:', assessment.id);
      // Fire and forget - don't wait for analysis to complete
      supabase.functions.invoke('analyze-des-examples', {
        body: { assessmentId: assessment.id },
      }).then(({ error }) => {
        if (error) {
          console.error('Error invoking analyze-des-examples:', error);
        } else {
          console.log('DES analysis triggered successfully');
        }
      }).catch(err => {
        console.error('Failed to invoke analyze-des-examples:', err);
      });
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
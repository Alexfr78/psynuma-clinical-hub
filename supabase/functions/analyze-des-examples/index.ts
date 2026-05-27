import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasAuthenticatedJWT, unauthorizedResponse } from "../_shared/authGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DES item categories for clinical context
const DES_CATEGORIES: Record<number, { category: string; description: string }> = {
  1: { category: 'absorption', description: 'Absorción durante conducción' },
  2: { category: 'absorption', description: 'Absorción durante conversación' },
  3: { category: 'amnesia', description: 'Encontrarse en un lugar sin recordar cómo llegó' },
  4: { category: 'amnesia', description: 'Vestirse con ropa que no recuerda ponerse' },
  5: { category: 'amnesia', description: 'Encontrar objetos que no recuerda adquirir' },
  6: { category: 'amnesia', description: 'Ser llamado por otro nombre' },
  7: { category: 'depersonalization', description: 'Verse a sí mismo desde fuera' },
  8: { category: 'amnesia', description: 'No reconocer familia o amigos' },
  9: { category: 'amnesia', description: 'No recordar eventos importantes' },
  10: { category: 'amnesia', description: 'Ser acusado de mentir' },
  11: { category: 'depersonalization', description: 'No reconocerse en el espejo' },
  12: { category: 'depersonalization', description: 'Sentir que el mundo no es real' },
  13: { category: 'depersonalization', description: 'Sentir que el cuerpo no le pertenece' },
  14: { category: 'absorption', description: 'Revivir recuerdos vívidamente' },
  15: { category: 'absorption', description: 'No distinguir recuerdos de sueños' },
  16: { category: 'depersonalization', description: 'Lugar familiar parece extraño' },
  17: { category: 'absorption', description: 'Absorción en TV/películas' },
  18: { category: 'absorption', description: 'Fantasías que parecen reales' },
  19: { category: 'other', description: 'Capacidad de ignorar dolor' },
  20: { category: 'absorption', description: 'Mirar fijamente sin notar el tiempo' },
  21: { category: 'other', description: 'Hablar solo en voz alta' },
  22: { category: 'taxon', description: 'Actuar muy diferente según situación' },
  23: { category: 'other', description: 'Hacer cosas con facilidad variable' },
  24: { category: 'other', description: 'No recordar si hizo algo o lo imaginó' },
  25: { category: 'amnesia', description: 'Encontrar evidencias de acciones no recordadas' },
  26: { category: 'amnesia', description: 'Encontrar escritos que no recuerda hacer' },
  27: { category: 'taxon', description: 'Escuchar voces en su cabeza' },
  28: { category: 'depersonalization', description: 'Ver el mundo como a través de niebla' },
};

const CATEGORY_LABELS: Record<string, string> = {
  amnesia: 'Amnesia Disociativa',
  depersonalization: 'Despersonalización/Desrealización',
  absorption: 'Absorción/Imaginación',
  taxon: 'Síntomas Disociativos Patológicos',
  other: 'Otras Experiencias Disociativas',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await hasAuthenticatedJWT(req))) return unauthorizedResponse(corsHeaders);

  try {
    const { assessmentId } = await req.json();

    if (!assessmentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'assessmentId requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing DES examples for assessment:', assessmentId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch assessment response with examples
    const { data: response, error: responseError } = await supabase
      .from('assessment_responses')
      .select('id, answers, factor_scores, metadata')
      .eq('assessment_id', assessmentId)
      .single();

    if (responseError || !response) {
      console.error('Response not found:', responseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Respuesta no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const metadata = response.metadata || {};
    const examples = metadata.examples as Record<string, string> | undefined;
    const answers = response.answers as Record<string, number>;

    if (!examples || Object.keys(examples).length === 0) {
      console.log('No examples to analyze');
      return new Response(
        JSON.stringify({ success: true, message: 'Sin ejemplos para analizar' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare examples with context for AI analysis
    const examplesWithContext = Object.entries(examples)
      .filter(([_, text]) => text && text.trim().length > 0)
      .map(([indexStr, text]) => {
        const index = parseInt(indexStr, 10);
        const frequency = answers[indexStr] ?? 0;
        const categoryInfo = DES_CATEGORIES[index] || { category: 'other', description: 'Experiencia disociativa' };
        return {
          itemIndex: index,
          example: text.trim(),
          frequency,
          category: categoryInfo.category,
          categoryLabel: CATEGORY_LABELS[categoryInfo.category],
          itemDescription: categoryInfo.description,
        };
      });

    if (examplesWithContext.length === 0) {
      console.log('No valid examples to analyze');
      return new Response(
        JSON.stringify({ success: true, message: 'Sin ejemplos válidos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${examplesWithContext.length} examples with AI`);

    // Call Lovable AI for analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Servicio de IA no disponible' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Eres un psicólogo clínico experto en trastornos disociativos y en la interpretación del DES (Escala de Experiencias Disociativas). 

Tu tarea es analizar los ejemplos proporcionados por un paciente durante la evaluación DES. Para cada ejemplo debes:

1. **Interpretar clínicamente** el ejemplo en relación con el tipo de experiencia disociativa (amnesia, despersonalización, absorción, etc.)
2. **Evaluar la relevancia clínica**: alta, moderada o baja
3. **Identificar patrones**: conexiones con trauma, estrés, mecanismos de defensa
4. **Sugerir áreas de exploración** para la entrevista terapéutica

Responde en JSON con esta estructura exacta:
{
  "itemAnalysis": {
    "[itemIndex]": {
      "interpretation": "Análisis clínico del ejemplo",
      "clinicalRelevance": "high" | "moderate" | "low",
      "patterns": ["patrón identificado 1", "patrón identificado 2"],
      "suggestedExploration": ["pregunta/área a explorar 1", "pregunta/área a explorar 2"]
    }
  },
  "overallPatterns": ["patrón general 1", "patrón general 2"],
  "clinicalSummary": "Resumen clínico general de los ejemplos proporcionados"
}

Sé empático pero profesional. Los ejemplos provienen directamente del paciente.`;

    const userPrompt = `Analiza los siguientes ejemplos proporcionados por el paciente durante una evaluación DES:

${examplesWithContext.map(e => `
**Ítem ${e.itemIndex}** - ${e.categoryLabel} (${e.itemDescription})
Frecuencia reportada: ${e.frequency}%
Ejemplo del paciente: "${e.example}"
`).join('\n')}

Por favor proporciona un análisis clínico estructurado de estos ejemplos.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Error en análisis IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    console.log('AI response received, parsing...');

    // Parse AI response - extract JSON from potential markdown code blocks
    let analysisResult;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiContent;
      analysisResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.log('AI content:', aiContent);
      // Create a basic analysis from the text response
      analysisResult = {
        itemAnalysis: {},
        overallPatterns: ['Análisis generado por IA'],
        clinicalSummary: aiContent.substring(0, 500),
      };
    }

    // Enrich analysis with original example data
    const enrichedAnalysis = {
      ...analysisResult,
      itemAnalysis: Object.fromEntries(
        examplesWithContext.map(e => [
          e.itemIndex.toString(),
          {
            example: e.example,
            frequency: e.frequency,
            category: e.category,
            categoryLabel: e.categoryLabel,
            ...(analysisResult.itemAnalysis?.[e.itemIndex.toString()] || {
              interpretation: 'Análisis pendiente',
              clinicalRelevance: e.frequency >= 50 ? 'high' : e.frequency >= 20 ? 'moderate' : 'low',
              patterns: [],
              suggestedExploration: [],
            }),
          },
        ])
      ),
      analyzedAt: new Date().toISOString(),
    };

    // Update metadata with AI analysis
    const updatedMetadata = {
      ...metadata,
      aiAnalysis: enrichedAnalysis,
    };

    const { error: updateError } = await supabase
      .from('assessment_responses')
      .update({ metadata: updatedMetadata })
      .eq('id', response.id);

    if (updateError) {
      console.error('Error updating metadata:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al guardar análisis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('DES examples analysis completed successfully');

    return new Response(
      JSON.stringify({ success: true, analysis: enrichedAnalysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-des-examples:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

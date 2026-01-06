import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres un psicólogo clínico experto en el Inventario de Evaluación de la Personalidad (PAI).

Analiza el perfil PAI de un adulto, siguiendo estrictamente los criterios del manual oficial de Morey y la adaptación española de TEA Ediciones.

PROCESO DE ANÁLISIS:
1. Evalúa la validez del protocolo (INC, INF, IMN, IMP)
2. Analiza escalas clínicas elevadas (T ≥ 65)
3. Describe el significado clínico de cada elevación
4. Identifica riesgos (suicidio, violencia, descompensación)
5. Integra los resultados en una formulación clínica
6. Sugiere líneas de intervención y prioridades terapéuticas

REGLAS ESTRICTAS:
- No emitas diagnósticos cerrados DSM-5/CIE-11
- Usa lenguaje clínico profesional
- Prioriza la seguridad del paciente
- Diferencia claramente datos objetivos de hipótesis clínicas
- Sé específico en las elevaciones y su interpretación
- Considera el contexto clínico proporcionado

INTERPRETACIÓN DE PUNTUACIONES T:
- T < 60: Rango normal
- T 60-69: Elevación moderada
- T 70-79: Elevación clínicamente significativa
- T ≥ 80: Elevación marcada

ESCALAS DE VALIDEZ:
- INC (Inconsistencia): T > 73 invalida el protocolo
- INF (Infrecuencia): T > 75 sugiere respuestas aleatorias o exageración
- IMN (Impresión Negativa): T > 73 indica posible exageración de síntomas
- IMP (Impresión Positiva): T > 68 indica posible minimización

FORMATO DE RESPUESTA:
Devuelve un JSON estructurado con las siguientes secciones:
{
  "validez": {
    "estado": "válido" | "cuestionable" | "inválido",
    "observaciones": "string con detalles"
  },
  "perfilClinico": {
    "escalasElevadas": [
      {
        "escala": "código",
        "puntuacionT": número,
        "interpretacion": "texto"
      }
    ],
    "formulacionIntegrada": "texto de formulación clínica"
  },
  "riesgos": {
    "nivelGlobal": "bajo" | "moderado" | "alto",
    "suicidio": { "nivel": "string", "observaciones": "string" },
    "violencia": { "nivel": "string", "observaciones": "string" },
    "descompensacion": { "nivel": "string", "observaciones": "string" }
  },
  "hipotesisDiagnosticas": ["lista de hipótesis sin diagnósticos cerrados"],
  "intervenciones": {
    "prioridades": ["lista de prioridades terapéuticas"],
    "enfoqueSugerido": "descripción del enfoque",
    "precauciones": ["lista de precauciones a considerar"]
  },
  "resumenEjecutivo": "párrafo breve con los puntos clave"
}`;

interface TScores {
  [scale: string]: number;
}

interface RequestBody {
  assessmentId: string;
  tScores: TScores;
  clinicalContext?: string;
  patientAge?: number;
  patientGender?: string;
  consultationReason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assessmentId, tScores, clinicalContext, patientAge, patientGender, consultationReason } = 
      await req.json() as RequestBody;

    if (!assessmentId || !tScores) {
      return new Response(
        JSON.stringify({ error: 'Se requiere assessmentId y tScores' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Configuración de IA no disponible' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build user prompt with scores and context
    const scalesInfo = Object.entries(tScores)
      .map(([scale, score]) => `${scale}: T = ${score}`)
      .join('\n');

    const contextInfo = [
      clinicalContext && `Contexto clínico: ${clinicalContext}`,
      patientAge && `Edad: ${patientAge} años`,
      patientGender && `Género: ${patientGender}`,
      consultationReason && `Motivo de consulta: ${consultationReason}`,
    ].filter(Boolean).join('\n');

    const userPrompt = `Analiza el siguiente perfil PAI:

PUNTUACIONES T:
${scalesInfo}

${contextInfo ? `INFORMACIÓN ADICIONAL:\n${contextInfo}` : ''}

Genera un informe clínico estructurado siguiendo el formato JSON especificado.`;

    console.log('Calling Lovable AI for PAI interpretation...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent clinical output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de solicitudes excedido. Intente más tarde.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de IA agotados. Contacte al administrador.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Error al generar interpretación' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty AI response');
      return new Response(
        JSON.stringify({ error: 'Respuesta vacía del modelo de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON from response (handle markdown code blocks)
    let interpretation;
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      interpretation = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Return the raw text if parsing fails
      interpretation = { rawInterpretation: content };
    }

    // Save interpretation to assessment response metadata
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingResponse, error: fetchError } = await supabase
      .from('assessment_responses')
      .select('id, metadata')
      .eq('assessment_id', assessmentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching assessment response:', fetchError);
    }

    if (existingResponse) {
      const updatedMetadata = {
        ...(existingResponse.metadata as object || {}),
        paiInterpretation: interpretation,
        interpretationGeneratedAt: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('assessment_responses')
        .update({ metadata: updatedMetadata })
        .eq('id', existingResponse.id);

      if (updateError) {
        console.error('Error updating metadata:', updateError);
      }
    }

    console.log('PAI interpretation generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        interpretation,
        generatedAt: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in interpret-pai-results:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres un psicólogo clínico experto en el MMPI-2-RF (Inventario Multifásico de Personalidad de Minnesota-2 Reestructurado), tercera edición española de TEA Ediciones.

Analiza las respuestas V/F de un adulto al MMPI-2-RF, siguiendo estrictamente los criterios del manual oficial.

ESTRUCTURA DEL MMPI-2-RF (51 ESCALAS):

ESCALAS DE VALIDEZ (9):
- VRIN-r (Inconsistencia Variables): T ≥ 80 invalida, 70-79 cuestionable
- TRIN-r (Inconsistencia Verdadero): T ≥ 80 invalida, 70-79 cuestionable
- F-r (Infrecuencia): T ≥ 120 invalida, 100-119 cuestionable, 80-99 atención
- Fp-r (Psicopatología Infrecuente): T ≥ 100 invalida, 80-99 cuestionable
- Fs (Quejas Somáticas Infrecuentes): T ≥ 100 cuestionable para síntomas somáticos
- FBS-r (Validez de Síntomas): T ≥ 100 exageración probable, 80-99 posible
- RBS (Sesgo de Respuesta): T ≥ 100 invalida COG, 80-99 cuestionable (3ª ed.)
- L-r (Virtudes Inusuales): T ≥ 80 minimización probable, 65-79 posible
- K-r (Validez del Ajuste): T ≥ 70 defensividad, T < 40 autocrítica excesiva

ESCALAS DE SEGUNDO ORDEN (3):
- EID (Disfunción Emocional/Internalización)
- THD (Disfunción del Pensamiento)
- BXD (Disfunción Conductual/Externalización)

ESCALAS CLÍNICAS REESTRUCTURADAS RC (9):
- RCd (Desmoralización)
- RC1 (Quejas Somáticas)
- RC2 (Escasez de Emociones Positivas)
- RC3 (Cinismo)
- RC4 (Conducta Antisocial)
- RC6 (Ideas de Persecución)
- RC7 (Emociones Negativas Disfuncionales)
- RC8 (Experiencias Aberrantes)
- RC9 (Activación Hipomaníaca)

ESCALAS DE PROBLEMAS ESPECÍFICOS (23):
- Somáticas: MLS, GIC, HPC, NUC, COG
- Internalizadores: SUI, HLP, SFD, NFC, STW, AXY, ANP, BRF, MSF
- Externalizadores: JCP, SUB, AGG, ACT
- Interpersonales: FML, IPP, SAV, SHY, DSF

ESCALAS DE INTERESES (2): AES, MEC

ESCALAS PSY-5 (5): AGGR-r, PSYC-r, DISC-r, NEGE-r, INTR-r

PROCESO DE ANÁLISIS:
1. Evalúa validez del protocolo (9 escalas)
2. Analiza escalas de segundo orden para orientación global
3. Interpreta escalas RC elevadas (T ≥ 65)
4. Examina escalas de problemas específicos elevadas
5. Evalúa riesgos: SUI para suicidio, AGG para violencia
6. Integra resultados en formulación clínica
7. Propón hipótesis diagnósticas e intervenciones

INTERPRETACIÓN DE PUNTUACIONES T:
- T < 39: Bajo (posible minimización o fortaleza)
- T 39-64: Rango normal
- T 65-79: Elevación clínicamente significativa
- T ≥ 80: Elevación marcada

REGLAS:
- No emitas diagnósticos cerrados DSM-5/CIE-11
- Lenguaje clínico profesional
- Prioriza seguridad del paciente
- Diferencia datos objetivos de hipótesis
- Considera el contexto proporcionado

FORMATO DE RESPUESTA JSON:
{
  "validez": {
    "estado": "válido" | "cuestionable" | "inválido",
    "observaciones": "string con detalles",
    "escalasProblematicas": ["lista de escalas de validez elevadas"]
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

interface RequestBody {
  assessmentId: string;
  responses: Record<number, number>; // item index -> 0 (Falso) or 1 (Verdadero)
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
    const { assessmentId, responses, clinicalContext, patientAge, patientGender, consultationReason } = 
      await req.json() as RequestBody;

    if (!assessmentId || !responses) {
      return new Response(
        JSON.stringify({ error: 'Se requiere assessmentId y responses' }),
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

    // Summarize responses for analysis
    const totalItems = Object.keys(responses).length;
    const trueCount = Object.values(responses).filter(v => v === 1).length;
    const falseCount = totalItems - trueCount;

    // Create response pattern summary
    const responseSummary = `Total de ítems respondidos: ${totalItems}
Respuestas Verdadero: ${trueCount} (${((trueCount/totalItems)*100).toFixed(1)}%)
Respuestas Falso: ${falseCount} (${((falseCount/totalItems)*100).toFixed(1)}%)

Respuestas por ítem (índice: V=1/F=0):
${Object.entries(responses)
  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
  .map(([idx, val]) => `${idx}:${val}`)
  .join(', ')}`;

    const contextInfo = [
      clinicalContext && `Contexto clínico: ${clinicalContext}`,
      patientAge && `Edad: ${patientAge} años`,
      patientGender && `Género: ${patientGender}`,
      consultationReason && `Motivo de consulta: ${consultationReason}`,
    ].filter(Boolean).join('\n');

    const userPrompt = `Analiza las siguientes respuestas al MMPI-2-RF:

${responseSummary}

${contextInfo ? `INFORMACIÓN ADICIONAL:\n${contextInfo}` : ''}

Basándote en tu conocimiento integrado del MMPI-2-RF y los patrones de respuesta observados, genera un informe clínico estructurado siguiendo el formato JSON especificado.

IMPORTANTE: Como no dispongo de las claves de corrección exactas, basa tu análisis en:
1. El conocimiento general de qué ítems suelen indicar qué constructos
2. Los patrones de respuesta observados (tendencia a V o F, consistencia)
3. Los ítems críticos conocidos (ideación suicida, síntomas psicóticos, etc.)
4. La proporción general de respuestas y posibles sesgos de respuesta`;

    console.log('Calling Lovable AI for MMPI-2-RF interpretation...');

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
        temperature: 0.3,
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

    // Parse JSON from response
    let interpretation;
    try {
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
        mmpi2rfInterpretation: interpretation,
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

    console.log('MMPI-2-RF interpretation generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        interpretation,
        generatedAt: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in interpret-mmpi2rf-results:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Actúas como psicólogo clínico especializado en psicoterapia integradora.

Vas a analizar la transcripción de una sesión terapéutica y generar documentos clínicos.

REGLAS CLAVE:
- No inventes información.
- No añadas antecedentes, diagnósticos, emociones, motivaciones o conclusiones que no estén sustentadas por la transcripción.
- Si algo parece probable pero no está suficientemente claro, exprésalo como hipótesis clínica tentativa, no como hecho.
- Si un dato no aparece, no lo completes.
- Sustituye cualquier nombre propio o dato identificativo por "PACIENTE" y "TERAPEUTA".
- No incluyas información identificativa.
- Mantén fidelidad clínica a la sesión real.
- Repite una transcripción cuando una cita breve sea especialmente útil para ilustrar una vivencia.
- Prioriza claridad, utilidad clínica y precisión conceptual.
- No moralices, no paternalices y no uses frases vacías de autoayuda.

PROCESO INTERNO OBLIGATORIO ANTES DE REDACTAR:
Antes de escribir, analiza internamente la sesión:
1. Motivos o focos principales trabajados en la sesión.
2. Situaciones concretas relatadas por el paciente.
3. Emociones, estados internos y reacciones relevantes detectadas.
4. Cogniciones, creencias, conflictos, patrones relacionales o conductuales que aparecen.
5. Intervenciones del terapeuta: preguntas relevantes, reformulaciones, señalamientos, psicoeducación, confrontaciones suaves, validación, propuestas de tarea.
6. Insights o puntos de inflexión surgidos durante la conversación.
7. Acuerdos, tareas o elementos a seguir explorando.
8. Diferencia claramente entre: hechos observados o expresados, interpretaciones o hipótesis clínicas.

SI LA TRANSCRIPCIÓN ES CONFUSA, INCOMPLETA O FRAGMENTARIA:
- Reconstruye únicamente aquello que pueda inferirse con prudencia.
- No rellenes vacíos importantes.
- Usa fórmulas como: "Parece emerger...", "Se observa de forma tentativa...", "No queda completamente claro en la transcripción, aunque se sugiere..."
- Nunca presentes una inferencia incierta como un hecho confirmado.

INDICACIONES DE REDACCIÓN:
- No utilices tablas.
- No abuses de viñetas.
- No repitas la misma idea en varios apartados.
- Mantén un tono profesional y natural.
- Si no hay tareas explícitas en la sesión, no las inventes; formula propuestas prudentes y deja claro que son sugerencias.`;

const LAYER1_PROMPT = `Realiza la CAPA 1 — Extracción clínica base.

Analiza la transcripción y extrae de forma estructurada:
1. TEMAS Y FOCOS PRINCIPALES: Los motivos o focos principales trabajados en la sesión.
2. SITUACIONES RELATADAS: Situaciones concretas relatadas por el paciente.
3. EMOCIONES Y ESTADOS INTERNOS: Emociones, estados internos y reacciones relevantes detectadas.
4. PATRONES COGNITIVOS Y CONDUCTUALES: Cogniciones, creencias, conflictos, patrones relacionales o conductuales.
5. INTERVENCIONES DEL TERAPEUTA: Preguntas relevantes, reformulaciones, señalamientos, psicoeducación, confrontaciones suaves, validación, propuestas de tarea.
6. INSIGHTS Y PUNTOS DE INFLEXIÓN: Momentos clave de comprensión o cambio.
7. ACUERDOS Y TAREAS: Acuerdos explícitos, tareas o elementos a seguir explorando.
8. DUDAS O AMBIGÜEDADES: Aspectos que no quedan claros o que requieren más exploración.
9. DIFERENCIACIÓN: Distingue claramente entre hechos observados/expresados e interpretaciones/hipótesis clínicas.

Formato: texto estructurado con los apartados numerados, redactado de forma clara y concisa.`;

const LAYER2_PROMPT = `Usando la base clínica extraída, genera el INFORME CLÍNICO PARA PROFESIONALES.

Criterios de estilo:
- Lenguaje técnico, claro y profesional
- Buena capacidad de conceptualización
- Distinguir observación de hipótesis
- Incluir intervenciones terapéuticas
- Señalar líneas de exploración y planificación
- No redactar como una simple transcripción

FORMATO:

1. RESUMEN RÁPIDO
Síntesis breve de 5 a 8 líneas con el foco principal de la sesión, los temas trabajados y el sentido clínico general.

2. RESUMEN CLÍNICO EXTENDIDO
Texto estructurado por bloques temáticos. En cada bloque, integra de forma natural:
- Situación o contenido relatado por el paciente
- Emociones o respuestas observadas
- Patrones cognitivos, conductuales o relacionales implicados
- Intervenciones del terapeuta
- Hipótesis o formulaciones clínicas tentativas
- Conceptos psicológicos explicados en sesión, si los hubo
No lo conviertas en una lista telegráfica. Debe leerse como una síntesis clínica ordenada y útil.

3. INTERVENCIONES TERAPÉUTICAS RELEVANTES
Describe de forma breve y técnica qué hizo el TERAPEUTA durante la sesión y con qué finalidad aparente. Distingue entre exploración, validación, psicoeducación, reformulación, confrontación, clarificación, focalización, trabajo emocional o planificación.

4. SIGUIENTES PASOS
Divide en dos subapartados:
a) Para el PACIENTE: Tareas, observaciones, ejercicios, autorregistros, focos de reflexión o conductas a observar entre sesiones.
b) Para el TERAPEUTA: Aspectos a seguir explorando, hipótesis a contrastar, focos de intervención y objetivos clínicos inmediatos.

5. PROPUESTA DE INTERVENCIÓN
Propón líneas de trabajo para próximas sesiones basadas únicamente en el contenido de esta sesión. Puedes incluir objetivos, técnicas o estrategias compatibles con el material trabajado. No propongas intervenciones desconectadas de la transcripción.`;

const LAYER3_PROMPT = `Usando la base clínica extraída, genera el INFORME DE SESIÓN PARA EL PACIENTE.

Criterios de estilo:
- Lenguaje claro, cercano, comprensible y respetuoso
- Explicar ideas psicológicas de forma sencilla
- Centrarse en lo trabajado, lo comprendido y lo que puede ayudar entre sesiones
- Evitar tecnicismos innecesarios
- Evitar tono excesivamente solemne o infantilizante
- No atribuyas aprendizajes profundos, cambios internos ni conclusiones transformadoras si no emergen con claridad en la sesión
- Prioriza una formulación honesta y ajustada: qué se habló, qué se observó y qué puede seguir explorándose
- No confundas contenido verbalizado por el paciente con formulación clínica del terapeuta

FORMATO:

1. LO MÁS IMPORTANTE DE LA SESIÓN
Síntesis breve y clara, en lenguaje accesible, de 4 a 6 líneas.

2. LO QUE TRABAJAMOS HOY
Explica con claridad los temas tratados durante la sesión, organizados por apartados con títulos útiles y naturales. Incluye:
- Situaciones comentadas
- Cómo te sentiste o qué te fue pasando
- Ideas o patrones que aparecieron
- Nuevas formas de entender lo que está ocurriendo
Si aparece algún concepto psicológico, explícalo de forma sencilla y aplicada a lo hablado en sesión.

3. IDEAS IMPORTANTES PARA QUEDARTE
Resume en 3 a 6 ideas claras los aprendizajes, observaciones o reflexiones más valiosas de la sesión. Deben ser concretas, no frases genéricas.

4. PROPUESTAS PARA ESTA SEMANA
Indica acciones, ejercicios, observaciones o pequeñas tareas que puedan ser útiles hasta la próxima sesión. Escríbelas de forma clara, realista y aplicable.

5. CIERRE DE LA SESIÓN
Escribe un cierre breve, humano y respetuoso, que recoja el sentido del trabajo realizado y ayude al paciente a continuar el proceso.`;

// ─── AI Router ───────────────────────────────────────────────────────────────
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  provider: string,
  model: string,
  apiKey: string,
): Promise<string> {

  if (provider === 'gemini') {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Gemini API error: ${response.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Default: OpenAI-compatible
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI API error: ${response.status}`);
  return data.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcription, layer, baseAnalysis, centerId } = await req.json();

    if (!transcription || !layer) {
      return new Response(
        JSON.stringify({ error: 'Se requiere transcription y layer (1, 2 o 3)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Load center AI configuration ────────────────────────────────────────
    let provider = 'openai';
    let model = 'gpt-4.1';
    let apiKey = '';
    let systemPrompt = SYSTEM_PROMPT;
    let layer1Prompt = LAYER1_PROMPT;
    let layer2Prompt = LAYER2_PROMPT;
    let layer3Prompt = LAYER3_PROMPT;

    if (centerId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: center } = await supabase
        .from('centers')
        .select(`
          ai_provider, openai_model, gemini_model,
          openai_api_key_encrypted, gemini_api_key_encrypted,
          ai_prompt_system, ai_prompt_layer1, ai_prompt_layer2, ai_prompt_layer3
        `)
        .eq('id', centerId)
        .single();

      if (center) {
        provider = center.ai_provider || 'openai';

        if (provider === 'gemini') {
          model = center.gemini_model || 'gemini-2.5-pro';
          if (!center.gemini_api_key_encrypted) {
            return new Response(
              JSON.stringify({ error: 'API key de Gemini no configurada. Ve a Ajustes → Inteligencia Artificial.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          apiKey = (await decryptSecret(center.gemini_api_key_encrypted)).replace(/[^\x20-\x7E]/g, '').trim();
        } else {
          model = center.openai_model || 'gpt-4.1';
          if (!center.openai_api_key_encrypted) {
            return new Response(
              JSON.stringify({ error: 'API key de OpenAI no configurada. Ve a Ajustes → Inteligencia Artificial.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          apiKey = (await decryptSecret(center.openai_api_key_encrypted)).trim();
        }

        // Use custom prompts if provided
        if (center.ai_prompt_system) systemPrompt = center.ai_prompt_system;
        if (center.ai_prompt_layer1) layer1Prompt = center.ai_prompt_layer1;
        if (center.ai_prompt_layer2) layer2Prompt = center.ai_prompt_layer2;
        if (center.ai_prompt_layer3) layer3Prompt = center.ai_prompt_layer3;
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key no configurada. Ve a Ajustes → Inteligencia Artificial.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Build prompt for the requested layer ────────────────────────────────
    let userPrompt: string;

    if (layer === 1) {
      userPrompt = `${layer1Prompt}\n\nTRANSCRIPCIÓN DE LA SESIÓN:\n\n${transcription}`;
    } else if (layer === 2) {
      if (!baseAnalysis) {
        return new Response(
          JSON.stringify({ error: 'La capa 2 requiere el análisis base (baseAnalysis)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userPrompt = `BASE CLÍNICA EXTRAÍDA (CAPA 1):\n\n${baseAnalysis}\n\nTRANSCRIPCIÓN ORIGINAL:\n\n${transcription}\n\n${layer2Prompt}`;
    } else if (layer === 3) {
      if (!baseAnalysis) {
        return new Response(
          JSON.stringify({ error: 'La capa 3 requiere el análisis base (baseAnalysis)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userPrompt = `BASE CLÍNICA EXTRAÍDA (CAPA 1):\n\n${baseAnalysis}\n\nTRANSCRIPCIÓN ORIGINAL:\n\n${transcription}\n\n${layer3Prompt}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Layer debe ser 1, 2 o 3' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[analyze] Layer ${layer} | Provider: ${provider} | Model: ${model}`);

    const content = await callAI(systemPrompt, userPrompt, provider, model, apiKey);

    console.log(`[analyze] Layer ${layer} completed — ${content.split(/\s+/).length} words`);

    return new Response(
      JSON.stringify({ success: true, content, layer }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-session-transcription:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Categorías de tendencias para el análisis
const TENDENCY_CATEGORIES = {
  hipoactivacion: {
    label: 'Hipoactivación',
    description: 'Evitación, supresión y anestesia emocional',
  },
  hiperactivacion: {
    label: 'Hiperactivación',
    description: 'Desbordamiento, intensidad y contagio emocional',
  },
  disregulacion: {
    label: 'Disregulación',
    description: 'Emociones ajenas, cambios bruscos, alexitimia',
  },
  autocritica: {
    label: 'Autocrítica',
    description: 'Juicio negativo sobre las propias emociones',
  },
  rumiacion: {
    label: 'Rumiación',
    description: 'Pensamiento repetitivo sobre emociones',
  },
  control: {
    label: 'Control Excesivo',
    description: 'Necesidad de controlar las emociones',
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { assessmentId, factorScores, answers, figures } = await req.json();

    if (!assessmentId || !factorScores || !answers) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY no está configurada");
    }

    // Preparar resumen de datos para el prompt
    const problematicEmotions = answers['3'] || [];
    const tendencies1 = answers['4'] || [];
    const tendencies2 = answers['5'] || [];
    const allTendencies = [...tendencies1, ...tendencies2];
    const positiveMoments = (answers['18'] || []).filter((m: string) => m && m.trim());

    // Determinar patrón predominante
    const hypoScore = factorScores['hipoactivacion'] || 0;
    const hyperScore = factorScores['hiperactivacion'] || 0;
    let patronPredominante = 'adaptativo';
    if (hypoScore > hyperScore + 1) patronPredominante = 'hipoactivacion';
    else if (hyperScore > hypoScore + 1) patronPredominante = 'hiperactivacion';
    else if (hypoScore >= 2 && hyperScore >= 2) patronPredominante = 'mixto';

    // Preparar información de figuras
    const figuresInfo = (figures || []).map((f: any) => ({
      nombre: f.name,
      relacion: f.relationship,
      sentimientos_positivos: f.positive_feelings?.length || 0,
      sentimientos_negativos: f.negative_feelings?.length || 0,
      reacciones_desadaptativas: f.maladaptive_reactions?.length || 0,
    }));

    const systemPrompt = `Eres un psicólogo clínico experto en regulación emocional, trauma y apego. 
Tu tarea es analizar los resultados de la Entrevista de Regulación Emocional (EMO) desarrollada por Anabel González.

El EMO evalúa:
1. Patrones actuales de regulación emocional
2. Historia de figuras reguladoras (cuidadores en la infancia)
3. Calidad de las experiencias de regulación compartida

Tu análisis debe basarse en:
- La teoría de la ventana de tolerancia de Ogden
- La teoría polivagal de Porges
- Los modelos de apego de Bowlby y Ainsworth
- El concepto de disociación estructural

Genera interpretaciones clínicas útiles pero siempre con el caveat de que requieren validación del profesional tratante.`;

    const userPrompt = `Analiza los siguientes resultados del EMO:

## Datos cuantitativos:
- Emociones problemáticas identificadas: ${problematicEmotions.length} (${problematicEmotions.join(', ')})
- Tendencias disfuncionales: ${allTendencies.length}
- Patrón predominante: ${patronPredominante}
- Puntuaciones por categoría:
  * Hipoactivación: ${factorScores['hipoactivacion'] || 0}
  * Hiperactivación: ${factorScores['hiperactivacion'] || 0}
  * Disregulación: ${factorScores['disregulacion'] || 0}
  * Autocrítica: ${factorScores['autocritica'] || 0}
  * Rumiación: ${factorScores['rumiacion'] || 0}
  * Control excesivo: ${factorScores['control'] || 0}
- Momentos de regulación positiva recordados: ${positiveMoments.length}

## Tendencias seleccionadas:
${allTendencies.map((t: string) => `- ${t}`).join('\n')}

## Respuestas cualitativas:
- Modo de regular emociones: ${answers['1'] || 'No respondido'}
- Dificultad para sentir emociones: ${answers['2'] || 'No respondido'}
- Origen temporal de dificultades: ${answers['6'] || 'No respondido'}
- Periodos de empeoramiento: ${answers['7'] || 'No respondido'}

## Historia de figuras:
- Personas con las que se crió: ${answers['8'] || 'No respondido'}
- Cambios en convivencia: ${answers['9'] || 'No respondido'}
- Figuras con influencia positiva: ${answers['15'] || 'No respondido'}
- Figuras con influencia negativa: ${answers['16'] || 'No respondido'}
- Figuras ausentes emocionalmente: ${answers['17'] || 'No respondido'}

${figuresInfo.length > 0 ? `## Evaluación de figuras específicas:
${figuresInfo.map((f: any) => `- ${f.nombre} (${f.relacion}): ${f.sentimientos_positivos} positivos, ${f.sentimientos_negativos} negativos, ${f.reacciones_desadaptativas} reacciones desadaptativas`).join('\n')}` : ''}

Genera un análisis clínico estructurado en formato JSON con los siguientes campos:
{
  "perfil_regulacion": "Descripción del perfil de regulación emocional del paciente",
  "patron_predominante": "hipoactivacion|hiperactivacion|mixto|adaptativo",
  "calidad_apego": "Análisis de la calidad del apego temprano basado en las figuras descritas",
  "recursos_regulacion": ["Lista de fortalezas y recursos identificados"],
  "areas_intervencion": ["Lista de áreas prioritarias para la intervención terapéutica"],
  "hipotesis_origen": "Hipótesis sobre el origen de los patrones actuales basada en la historia relacional",
  "resumen_clinico": "Resumen integrador de 2-3 párrafos para incluir en informe clínico"
}`;

    console.log('Generating EMO interpretation with AI...');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`Error del servicio de IA: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No se recibió respuesta del servicio de IA");
    }

    // Extraer JSON de la respuesta
    let interpretation;
    try {
      // Buscar JSON en la respuesta
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        interpretation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No se encontró JSON en la respuesta");
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.log("Raw response:", content);
      throw new Error("Error al procesar la respuesta de IA");
    }

    // Guardar la interpretación en metadata del assessment_response
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: updateError } = await supabase
      .from("assessment_responses")
      .update({
        metadata: {
          emoInterpretation: interpretation,
          interpretedAt: new Date().toISOString(),
        },
      })
      .eq("assessment_id", assessmentId);

    if (updateError) {
      console.error("Error saving interpretation:", updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        interpretation 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in interpret-emo-results:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

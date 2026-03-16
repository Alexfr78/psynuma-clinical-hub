import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { assessmentId, factorScores, answers, figures, indicators } = await req.json();

    if (!assessmentId) {
      return new Response(
        JSON.stringify({ error: "Falta assessmentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // RESOLVE DATA: prefer payload, fallback to DB
    // =====================================================
    let resolvedAnswers = answers || {};
    let resolvedFactorScores = factorScores || {};
    let resolvedFigures = figures || [];

    // If answers are empty/missing, fetch from DB directly
    if (!answers || Object.keys(answers).length === 0) {
      console.log("[EMO-INTERPRET] No answers in payload, fetching from DB...");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: resp, error: fetchErr } = await supabase
        .from("assessment_responses")
        .select("answers, factor_scores, metadata")
        .eq("assessment_id", assessmentId)
        .maybeSingle();

      if (fetchErr) {
        console.error("[EMO-INTERPRET] DB fetch error:", fetchErr);
      } else if (resp) {
        const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v) || {};
        resolvedAnswers = parse(resp.answers);
        resolvedFactorScores = parse(resp.factor_scores);
        resolvedFigures = resolvedAnswers.figures || [];
      }
    }

    // =====================================================
    // NORMALIZE: support both semantic and legacy keys
    // =====================================================
    const a = resolvedAnswers;
    const emo = {
      reg_general: a.emo_reg_general || a.s1_description || a['1'] || '',
      dificultad_sentir: a.emo_dificultad_sentir || '',
      dificultad_sentir_explicacion: a.emo_dificultad_sentir_explicacion || '',
      emociones_problematicas: a.emo_emociones_problematicas || a.s1_difficult_emotions || a['3'] || [],
      emociones_problematicas_otro: a.emo_emociones_problematicas_otro || '',
      emociones_problematicas_por_que: a.emo_emociones_problematicas_por_que || '',
      patrones_1: a.emo_patrones_1 || a['4'] || [],
      patrones_2: a.emo_patrones_2 || a['5'] || [],
      patrones_otro_texto: a.emo_patrones_otro_texto || '',
      desde_cuando: a.emo_desde_cuando || a.s1_since_when || a['6'] || '',
      empeoro: a.emo_empeoro || '',
      empeoro_cuando: a.emo_empeoro_cuando || a.s1_worsening_periods || a['7'] || '',
      quienes_crianza: a.emo_quienes_crianza || a['8'] || '',
      cambio_convivencia: a.emo_cambio_convivencia || '',
      cambio_convivencia_detalle: a.emo_cambio_convivencia_detalle || '',
      figuras_fuera_familia: a.emo_figuras_fuera_familia || '',
      figuras_fuera_familia_detalle: a.emo_figuras_fuera_familia_detalle || '',
      cuidadores_contratados: a.emo_cuidadores_contratados || '',
      cuidadores_tiempo: a.emo_cuidadores_tiempo || '',
      internado: a.emo_internado || '',
      internado_detalle: a.emo_internado_detalle || '',
      adopcion: a.emo_adopcion || '',
      adopcion_detalle: a.emo_adopcion_detalle || '',
      figuras_positivas: a.emo_figuras_positivas || a['15'] || '',
      figuras_negativas: a.emo_figuras_negativas || a['16'] || '',
      figuras_ausentes: a.emo_figuras_ausentes || a['17'] || '',
      momentos_coregulacion: a.emo_momentos_coregulacion || [],
    };

    const figuresData: any[] = resolvedFigures.length > 0 ? resolvedFigures : (a.figures || []);
    const allPatterns = [...(emo.patrones_1 || []), ...(emo.patrones_2 || [])];
    const uniquePatterns = [...new Set(allPatterns)];

    // =====================================================
    // VALIDATE: ensure we have real data
    // =====================================================
    const hasSubstantiveData =
      emo.reg_general.length > 5 ||
      (emo.emociones_problematicas.length > 0) ||
      uniquePatterns.length > 0 ||
      figuresData.length > 0;

    if (!hasSubstantiveData) {
      console.error("[EMO-INTERPRET] Insufficient data for interpretation. Keys:", Object.keys(resolvedAnswers));
      return new Response(
        JSON.stringify({ error: "No hay datos suficientes para generar la interpretación. La evaluación puede no estar completada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // COMPUTE INDICATORS (if not provided)
    // =====================================================
    const REGULATION_PATTERNS: Record<string, string[]> = {
      supresion_evitacion: ['Evito sentir algunas cosas', 'Tiendo a suprimir o anular determinadas emociones', 'Me siento como anestesiado a nivel emocional'],
      hiperactivacion_desborde: ['Algunas de mis emociones suelen desbordarse', 'Mis emociones están siempre a flor de piel', 'Mis emociones son demasiado intensas'],
      confusion_emocional: ['En general no sé muy bien lo que siento'],
      rumiacion_emocional: ['Le doy vueltas y vueltas a cómo me siento'],
      contagio_emocional: ['Tiendo a contagiarme de las emociones de los demás'],
      verguenza_autocritica: ['A veces me avergüenzo de lo que puedo llegar a sentir', 'Me enfado conmigo mismo por sentir determinadas emociones'],
    };

    const REGULATION_LABELS: Record<string, string> = {
      supresion_evitacion: 'Supresión/Evitación',
      hiperactivacion_desborde: 'Hiperactivación/Desborde',
      confusion_emocional: 'Confusión emocional',
      rumiacion_emocional: 'Rumiación emocional',
      contagio_emocional: 'Contagio emocional',
      verguenza_autocritica: 'Vergüenza/Auto-crítica emocional',
    };

    const detectedIndicators: string[] = [];
    for (const [id, patterns] of Object.entries(REGULATION_PATTERNS)) {
      const matched = patterns.filter(p => uniquePatterns.includes(p));
      if (matched.length > 0) {
        detectedIndicators.push(REGULATION_LABELS[id] || id);
      }
    }

    const hasHipo = uniquePatterns.some(p => REGULATION_PATTERNS.supresion_evitacion.includes(p));
    const hasHiper = uniquePatterns.some(p => REGULATION_PATTERNS.hiperactivacion_desborde.includes(p));
    const patronPredominante = hasHipo && hasHiper ? 'mixto' : hasHipo ? 'hipoactivacion' : hasHiper ? 'hiperactivacion' : 'adaptativo';

    // =====================================================
    // PREPARE FIGURES SUMMARY
    // =====================================================
    const FEELINGS_POSITIVE = ['Entendido', 'Aceptado', 'Valorado', 'Especial', 'Importante', 'Protegido', 'Apoyado', 'Seguro'];
    const FEELINGS_NEGATIVE = ['Rechazado', 'Atemorizado', 'Inseguro', 'Invisible', 'Avergonzado', 'Humillado', 'Traicionado', 'Inútil', 'Ridículo', 'Culpable'];

    const figuresSummary = figuresData.map((f: any) => {
      const feelings = f.figure_feelings_words || [];
      const reactions = f.figure_reactions_to_your_emotion || [];
      const adjectives = (f.figure_adjectives || []).filter((a: any) => a.adjective).map((a: any) => a.adjective);
      const posCount = feelings.filter((w: string) => FEELINGS_POSITIVE.includes(w)).length;
      const negCount = feelings.filter((w: string) => FEELINGS_NEGATIVE.includes(w)).length;

      return {
        nombre: f.figure_name || 'Sin nombre',
        relacion: f.figure_relation || '',
        sentimientos_positivos: posCount,
        sentimientos_negativos: negCount,
        adjetivos: adjectives.slice(0, 5),
        reacciones: reactions.slice(0, 5),
        primer_recuerdo: f.figure_first_memory || '',
        expresion_cara: f.figure_face_expression || '',
        sigue_en_vida: f.figure_still_in_life || '',
        relacion_actual: f.figure_current_relationship || '',
        emocion_peor_self: f.figure_worst_emotion_self || '',
        emocion_peor_tu: f.figure_worst_emotion_you || '',
      };
    });

    // =====================================================
    // LOG DATA SUMMARY
    // =====================================================
    console.log(`[EMO-INTERPRET] Data summary: ${emo.emociones_problematicas.length} problematic emotions, ${uniquePatterns.length} patterns, ${figuresData.length} figures, ${detectedIndicators.length} detected indicators, pattern: ${patronPredominante}`);

    // =====================================================
    // AI PROMPT
    // =====================================================
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY no está configurada");
    }

    const systemPrompt = `Eres un psicólogo clínico experto en regulación emocional, trauma y apego. 
Tu tarea es analizar los resultados de la Entrevista de Regulación Emocional (EMO) desarrollada por Anabel González.

El EMO evalúa:
1. Patrones actuales de regulación emocional (supresión, hiperactivación, confusión, rumiación, contagio, vergüenza)
2. Historia de figuras reguladoras (cuidadores en la infancia)
3. Calidad de las experiencias de regulación compartida (corregulación)
4. Análisis por figura vincular (sentimientos, reacciones, adjetivos, matriz emocional)

Tu análisis debe basarse en:
- La teoría de la ventana de tolerancia de Ogden
- La teoría polivagal de Porges
- Los modelos de apego de Bowlby y Ainsworth
- El concepto de disociación estructural

INSTRUCCIONES IMPORTANTES:
- Genera interpretaciones clínicas RICAS y DETALLADAS basándote en TODOS los datos proporcionados.
- NO digas que "faltan datos" o que "la información es insuficiente" si se te proporcionan datos reales.
- Usa los datos cualitativos (narrativas, adjetivos, recuerdos) además de los cuantitativos.
- Incluye siempre el caveat de que requiere validación del profesional tratante.
- Responde SOLO con el JSON, sin texto adicional antes o después.`;

    // Build qualitative sections
    let qualitativeSection = '';
    if (emo.reg_general) qualitativeSection += `- Modo de regular emociones: "${emo.reg_general}"\n`;
    if (emo.dificultad_sentir) qualitativeSection += `- ¿Le cuesta sentir emociones?: ${emo.dificultad_sentir}`;
    if (emo.dificultad_sentir_explicacion) qualitativeSection += ` — "${emo.dificultad_sentir_explicacion}"`;
    qualitativeSection += '\n';
    if (emo.emociones_problematicas_por_que) qualitativeSection += `- Por qué son difíciles sus emociones: "${emo.emociones_problematicas_por_que}"\n`;
    if (emo.desde_cuando) qualitativeSection += `- Origen temporal: "${emo.desde_cuando}"\n`;
    if (emo.empeoro === 'si' && emo.empeoro_cuando) qualitativeSection += `- Períodos de empeoramiento: "${emo.empeoro_cuando}"\n`;
    if (emo.patrones_otro_texto) qualitativeSection += `- Otra tendencia descrita: "${emo.patrones_otro_texto}"\n`;

    let upbringingSection = '';
    if (emo.quienes_crianza) upbringingSection += `- Personas con las que se crió: "${emo.quienes_crianza}"\n`;
    if (emo.cambio_convivencia === 'si') upbringingSection += `- Cambios en convivencia: ${emo.cambio_convivencia_detalle || 'Sí'}\n`;
    if (emo.figuras_fuera_familia === 'si') upbringingSection += `- Figuras fuera de la familia: ${emo.figuras_fuera_familia_detalle || 'Sí'}\n`;
    if (emo.cuidadores_contratados === 'si') upbringingSection += `- Cuidadores contratados: ${emo.cuidadores_tiempo || 'Sí'}\n`;
    if (emo.internado === 'si') upbringingSection += `- Internado: ${emo.internado_detalle || 'Sí'}\n`;
    if (emo.adopcion === 'si') upbringingSection += `- Adopción/acogida: ${emo.adopcion_detalle || 'Sí'}\n`;
    if (emo.figuras_positivas) upbringingSection += `- Figuras con influencia positiva: "${emo.figuras_positivas}"\n`;
    if (emo.figuras_negativas) upbringingSection += `- Figuras con influencia negativa: "${emo.figuras_negativas}"\n`;
    if (emo.figuras_ausentes) upbringingSection += `- Figuras que deberían haber estado: "${emo.figuras_ausentes}"\n`;

    // Co-regulation moments
    let coregSection = '';
    const moments = emo.momentos_coregulacion || [];
    if (moments.length > 0) {
      const validMoments = moments.filter((m: any) => m.who || m.emotion || m.whatHelped);
      if (validMoments.length > 0) {
        coregSection = 'Momentos de corregulación recordados:\n';
        validMoments.forEach((m: any) => {
          coregSection += `  - Quién: ${m.who || '?'}, Emoción: ${m.emotion || '?'}, Qué ayudó: ${m.whatHelped || '?'}\n`;
        });
      }
    }

    // Figures detail
    let figuresSection = '';
    if (figuresSummary.length > 0) {
      figuresSection = 'Análisis de figuras vinculares:\n';
      figuresSummary.forEach((f: any) => {
        figuresSection += `\n### ${f.nombre} (${f.relacion})\n`;
        figuresSection += `  - Sentimientos positivos: ${f.sentimientos_positivos}, negativos: ${f.sentimientos_negativos}\n`;
        if (f.adjetivos.length > 0) figuresSection += `  - Adjetivos: ${f.adjetivos.join(', ')}\n`;
        if (f.reacciones.length > 0) figuresSection += `  - Reacciones ante tus emociones: ${f.reacciones.join(', ')}\n`;
        if (f.primer_recuerdo) figuresSection += `  - Primer recuerdo: "${f.primer_recuerdo}"\n`;
        if (f.expresion_cara) figuresSection += `  - Expresión facial típica: "${f.expresion_cara}"\n`;
        if (f.emocion_peor_self) figuresSection += `  - Emoción que peor llevaba (en sí misma): "${f.emocion_peor_self}"\n`;
        if (f.emocion_peor_tu) figuresSection += `  - Emoción que peor llevaba que sintieras tú: "${f.emocion_peor_tu}"\n`;
        if (f.sigue_en_vida) figuresSection += `  - ¿Sigue en su vida?: ${f.sigue_en_vida}\n`;
        if (f.relacion_actual) figuresSection += `  - Relación actual: "${f.relacion_actual}"\n`;
      });
    }

    // Factor scores section
    let factorSection = '';
    if (Object.keys(resolvedFactorScores).length > 0) {
      factorSection = 'Puntuaciones calculadas:\n';
      for (const [key, val] of Object.entries(resolvedFactorScores)) {
        factorSection += `  - ${key}: ${val}\n`;
      }
    }

    const userPrompt = `Analiza los siguientes resultados completos del EMO:

## Datos cuantitativos:
- Emociones problemáticas identificadas: ${emo.emociones_problematicas.length} (${Array.isArray(emo.emociones_problematicas) ? emo.emociones_problematicas.join(', ') : emo.emociones_problematicas})
- Tendencias/patrones seleccionados: ${uniquePatterns.length}
- Patrón predominante: ${patronPredominante}
- Indicadores de regulación detectados: ${detectedIndicators.length > 0 ? detectedIndicators.join(', ') : 'Ninguno significativo'}
- Figuras evaluadas: ${figuresData.length}

${factorSection}

## Patrones seleccionados por el paciente:
${uniquePatterns.length > 0 ? uniquePatterns.map(p => `- ${p}`).join('\n') : '- Ninguno seleccionado'}

## Respuestas cualitativas:
${qualitativeSection || '- Sin respuestas cualitativas registradas'}

## Historia de crianza:
${upbringingSection || '- Sin datos de crianza registrados'}

${coregSection}

${figuresSection}

Genera un análisis clínico COMPLETO y DETALLADO en formato JSON con estos campos exactos:
{
  "perfil_regulacion": "Descripción detallada del perfil de regulación emocional del paciente (mín. 3 frases)",
  "patron_predominante": "hipoactivacion|hiperactivacion|mixto|adaptativo",
  "calidad_apego": "Análisis detallado de la calidad del apego temprano basado en las figuras descritas (mín. 3 frases)",
  "recursos_regulacion": ["Lista de fortalezas y recursos identificados (mín. 2 items)"],
  "areas_intervencion": ["Lista de áreas prioritarias para la intervención terapéutica (mín. 3 items)"],
  "hipotesis_origen": "Hipótesis sobre el origen de los patrones actuales basada en la historia relacional (mín. 3 frases)",
  "resumen_clinico": "Resumen integrador de 2-3 párrafos para incluir en informe clínico"
}`;

    console.log("[EMO-INTERPRET] Calling AI gateway...");

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
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[EMO-INTERPRET] AI gateway error:", response.status, errorText);
      throw new Error(`Error del servicio de IA: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No se recibió respuesta del servicio de IA");
    }

    // Parse JSON from AI response
    let interpretation;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        interpretation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No se encontró JSON en la respuesta");
      }
    } catch (parseError) {
      console.error("[EMO-INTERPRET] Parse error:", parseError);
      console.log("[EMO-INTERPRET] Raw response:", content.substring(0, 500));
      throw new Error("Error al procesar la respuesta de IA");
    }

    // =====================================================
    // VALIDATE INTERPRETATION QUALITY
    // =====================================================
    const requiredFields = ['perfil_regulacion', 'patron_predominante', 'calidad_apego', 'recursos_regulacion', 'areas_intervencion', 'resumen_clinico'];
    const missingFields = requiredFields.filter(f => !interpretation[f]);
    if (missingFields.length > 0) {
      console.warn("[EMO-INTERPRET] Missing fields in interpretation:", missingFields);
    }

    // Validate that interpretation doesn't claim insufficient data when we have it
    const resumen = (interpretation.resumen_clinico || '').toLowerCase();
    const perfil = (interpretation.perfil_regulacion || '').toLowerCase();
    const insufficientPhrases = ['información insuficiente', 'datos insuficientes', 'no se dispone de', 'no hay datos', 'faltan datos'];
    const claimsInsufficient = insufficientPhrases.some(phrase => resumen.includes(phrase) || perfil.includes(phrase));

    if (claimsInsufficient && hasSubstantiveData) {
      console.warn("[EMO-INTERPRET] AI claims insufficient data despite having substantive data. Re-prompting would be ideal. Proceeding with current result but flagging.");
      interpretation._data_validation_warning = "La IA indicó datos insuficientes pero se proporcionaron datos reales. Considere regenerar.";
    }

    // =====================================================
    // SAVE TO DB (merge with existing metadata)
    // =====================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch existing metadata to merge
    const { data: existingResp } = await supabase
      .from("assessment_responses")
      .select("metadata")
      .eq("assessment_id", assessmentId)
      .maybeSingle();

    const existingMetadata = (typeof existingResp?.metadata === 'string' ? JSON.parse(existingResp.metadata) : existingResp?.metadata) || {};

    const { error: updateError } = await supabase
      .from("assessment_responses")
      .update({
        metadata: {
          ...existingMetadata,
          emoInterpretation: interpretation,
          interpretedAt: new Date().toISOString(),
          interpretationDataSummary: {
            answerKeys: Object.keys(resolvedAnswers).length,
            factorKeys: Object.keys(resolvedFactorScores).length,
            figureCount: figuresData.length,
            patternCount: uniquePatterns.length,
            emotionCount: emo.emociones_problematicas.length,
          },
        },
      })
      .eq("assessment_id", assessmentId);

    if (updateError) {
      console.error("[EMO-INTERPRET] Error saving interpretation:", updateError);
    } else {
      console.log("[EMO-INTERPRET] Interpretation saved successfully");
    }

    return new Response(
      JSON.stringify({ success: true, interpretation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[EMO-INTERPRET] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

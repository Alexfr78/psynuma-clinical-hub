import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Factor labels and interpretation texts (duplicated from frontend for edge function context)
const FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  // SELFCARE factors
  AD: { label: 'Conducta Autodestructiva', description: 'Patrón de autocuidado invertido' },
  TA: { label: 'Falta de tolerancia al afecto positivo', description: 'Dificultad para recibir elogios' },
  PA: { label: 'Problemas para dejarse ayudar', description: 'Autosuficiencia defensiva' },
  R: { label: 'Resentimiento por no reciprocidad', description: 'Sensación de injusticia' },
  NP: { label: 'No actividades positivas', description: 'Dificultad para priorizar placer' },
  NN: { label: 'No atender las propias necesidades', description: 'Prioriza necesidades ajenas' },
  // SCL-90-R factors
  SOM: { label: 'Somatización', description: 'Síntomas somáticos y físicos' },
  OBS: { label: 'Obsesión-Compulsión', description: 'Pensamientos y conductas obsesivas' },
  SEN: { label: 'Sensibilidad Interpersonal', description: 'Sentimientos de inadecuación' },
  DEP: { label: 'Depresión', description: 'Síntomas depresivos' },
  ANS: { label: 'Ansiedad', description: 'Síntomas de ansiedad' },
  HOS: { label: 'Hostilidad', description: 'Pensamientos y conductas hostiles' },
  FOB: { label: 'Ansiedad Fóbica', description: 'Miedos fóbicos' },
  PAR: { label: 'Ideación Paranoide', description: 'Suspicacia y desconfianza' },
  PSI: { label: 'Psicoticismo', description: 'Síntomas psicóticos' },
  GSI: { label: 'Índice de Severidad Global', description: 'Media de todos los ítems' },
  PST: { label: 'Total de Síntomas Positivos', description: 'Número de síntomas presentes' },
  PSDI: { label: 'Índice de Malestar de Síntomas Positivos', description: 'Intensidad promedio de síntomas presentes' },
};

const INTERPRETATION_TEXTS: Record<string, { interpretation: string; interventions: string[] }> = {
  AD: {
    interpretation: 'Patrón de autocuidado invertido: cuando se encuentra peor, tiende a tratarse peor. Puede haber rabia dirigida hacia sí mismo y una voz crítica interiorizada.',
    interventions: ['Autocuidado cognitivo: entrenar un diálogo interno más compasivo.', 'Explorar origen y función de la voz crítica.', 'Trabajo con partes/niño interior desde un enfoque seguro y compasivo.', 'Plan de reducción de conductas de riesgo y aumento de conductas protectoras.'],
  },
  TA: {
    interpretation: 'Dificultad para recibir elogios, reconocimiento o afecto positivo. Puede estar asociado a vergüenza o a experiencias tempranas de crítica/castigo al mostrarse.',
    interventions: ['Detectar y procesar bloqueos ante el elogio.', 'Ejercicios graduados de aceptación del reconocimiento.', 'Instalación de recursos de valía/aceptación.', 'Trabajo con vergüenza asociada a ser visto positivamente.'],
  },
  PA: {
    interpretation: 'Puede reflejar autosuficiencia defensiva y desconfianza básica. Pedir ayuda pudo vivirse como inútil o peligroso.',
    interventions: ['Reforzar seguridad y confianza en el vínculo terapéutico.', 'Validar la necesidad legítima de apoyo.', 'Reestructurar creencias tipo "pedir ayuda es debilidad".', 'Ensayar peticiones pequeñas y concretas en contextos seguros.'],
  },
  R: {
    interpretation: 'Sensación de injusticia y frustración porque los demás no responden como se espera. Puede haber expectativas elevadas derivadas de carencias previas.',
    interventions: ['Ajustar expectativas y diferenciar pasado vs presente.', 'Clarificar necesidades actuales y formas realistas de pedirlas.', 'Explorar límites y acuerdos en relaciones.', 'Fomentar responsabilidad personal en autocuidado y petición de apoyo.'],
  },
  NP: {
    interpretation: 'Dificultad para priorizar placer y actividades agradables. Puede estar sostenido por culpa, anhedonia o creencias de "no merezco disfrutar".',
    interventions: ['Programación gradual de actividades agradables.', 'Identificar culpa asociada al disfrute y trabajar permisos.', 'Entrenar habilidades de disfrute/descanso consciente.', 'Revisar barreras prácticas (tiempo, energía, hábitos).'],
  },
  NN: {
    interpretation: 'Prioriza necesidades ajenas sobre las propias, con dificultad para poner límites. Puede estar relacionado con miedo a perder el vínculo o con rol de cuidador.',
    interventions: ['Entrenamiento en asertividad y límites.', 'Legitimación de necesidades propias y autocuidado básico.', 'Diferenciar "ser buena persona" de "dejarse invadir".', 'Ensayar frases y conductas de protección del espacio personal.'],
  },
  SOM: {
    interpretation: 'Elevado nivel de síntomas somáticos. Puede indicar somatización de la ansiedad o malestar emocional expresado a través del cuerpo.',
    interventions: ['Psicoeducación sobre la conexión mente-cuerpo.', 'Técnicas de relajación y respiración.', 'Explorar factores emocionales asociados a los síntomas.', 'Valorar derivación médica si procede.'],
  },
  OBS: {
    interpretation: 'Presencia significativa de pensamientos intrusivos, compulsiones o dificultad para soltar ideas. Puede afectar la funcionalidad diaria.',
    interventions: ['Técnicas de exposición con prevención de respuesta (si TOC).', 'Reestructuración cognitiva de pensamientos obsesivos.', 'Mindfulness para desapego de pensamientos.', 'Valorar tratamiento farmacológico si severidad alta.'],
  },
  SEN: {
    interpretation: 'Alta sensibilidad al rechazo y evaluación negativa de los demás. Sentimientos de inadecuación e inferioridad en contextos sociales.',
    interventions: ['Trabajo con autoestima y autoimagen.', 'Exposición gradual a situaciones sociales temidas.', 'Reestructuración de creencias sobre evaluación social.', 'Entrenamiento en habilidades sociales.'],
  },
  DEP: {
    interpretation: 'Síntomas depresivos significativos: bajo estado de ánimo, pérdida de interés, fatiga, pensamientos negativos sobre sí mismo y el futuro.',
    interventions: ['Activación conductual gradual.', 'Reestructuración de pensamientos negativos automáticos.', 'Evaluar ideación autolítica y establecer plan de seguridad si precisa.', 'Valorar tratamiento farmacológico.'],
  },
  ANS: {
    interpretation: 'Elevados niveles de ansiedad: nerviosismo, tensión, síntomas de pánico. Puede estar afectando la funcionalidad.',
    interventions: ['Psicoeducación sobre la respuesta de ansiedad.', 'Técnicas de relajación y respiración diafragmática.', 'Exposición gradual a situaciones evitadas.', 'Reestructuración de pensamientos catastróficos.'],
  },
  HOS: {
    interpretation: 'Presencia de hostilidad, irritabilidad e ira. Puede manifestarse en pensamientos agresivos o dificultad para controlar impulsos.',
    interventions: ['Técnicas de control de la ira.', 'Identificar desencadenantes y señales de alerta.', 'Entrenamiento en comunicación asertiva.', 'Explorar fuentes subyacentes de frustración.'],
  },
  FOB: {
    interpretation: 'Miedos fóbicos significativos: agorafobia, fobias sociales o específicas que limitan el funcionamiento.',
    interventions: ['Jerarquía de exposición gradual.', 'Técnicas de afrontamiento en situaciones temidas.', 'Reestructuración de creencias sobre el peligro.', 'Considerar EMDR si hay trauma asociado.'],
  },
  PAR: {
    interpretation: 'Tendencia a la suspicacia, desconfianza hacia los demás, sensación de que otros hablan mal o tienen intenciones hostiles.',
    interventions: ['Explorar experiencias pasadas de traición o daño.', 'Trabajo con distorsiones cognitivas (lectura de mente, personalización).', 'Construir experiencias relacionales seguras.', 'Evaluar contexto actual de relaciones.'],
  },
  PSI: {
    interpretation: 'Presencia de síntomas del espectro psicótico: experiencias inusuales, pensamiento mágico, aislamiento, despersonalización.',
    interventions: ['Evaluación exhaustiva de síntomas psicóticos.', 'Valorar derivación a psiquiatría.', 'Trabajo con síntomas disociativos si presentes.', 'Intervención temprana si síndrome prodrómico.'],
  },
};

const FACTOR_ORDER = ['AD', 'TA', 'PA', 'R', 'NP', 'NN'];
const SCL90_FACTOR_ORDER = ['SOM', 'OBS', 'SEN', 'DEP', 'ANS', 'HOS', 'FOB', 'PAR', 'PSI'];
const SCL90_GLOBAL_ORDER = ['GSI', 'PST', 'PSDI'];

function getFactorOrder(templateCode: string): string[] {
  if (templateCode === 'SCL90_V1') return SCL90_FACTOR_ORDER;
  return FACTOR_ORDER;
}

function computeLevel(score: number, threshold: number): 'bajo' | 'moderado' | 'alto' {
  const high = threshold;
  const moderate = threshold * 0.75;
  if (score > high) return 'alto';
  if (score > moderate) return 'moderado';
  return 'bajo';
}

function isAlert(score: number, threshold: number): boolean {
  return score > threshold;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    console.log('Fetching image from:', url);
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const base64 = base64Encode(arrayBuffer);
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assessment_id } = await req.json();

    if (!assessment_id) {
      return new Response(
        JSON.stringify({ error: "assessment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('Generating PDF for assessment:', assessment_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch assessment with all related data
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select(`
        *,
        patients (first_name, last_name, date_of_birth, gender, email),
        profiles:professional_id (first_name, last_name, collegiate_number),
        assessment_templates:template_id (name, code, flag_threshold, chart_full_mark, items, scoring),
        assessment_responses (answers, factor_scores, metadata)
      `)
      .eq("id", assessment_id)
      .single();

    if (assessmentError || !assessment) {
      console.error("Assessment fetch error:", assessmentError);
      return new Response(
        JSON.stringify({ error: "Assessment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch center data
    const { data: center } = await supabase
      .from("centers")
      .select("name, logo_url, address, city, postal_code, phone, email")
      .eq("id", assessment.center_id)
      .single();

    // Process data
    const patient = assessment.patients;
    const professional = assessment.profiles;
    const template = assessment.assessment_templates;
    const response = assessment.assessment_responses?.[0] || null;

    const factorScores = response?.factor_scores || {};
    const answers = response?.answers || {};
    const metadata = response?.metadata || {};

    // Get stored AI interpretations
    const paiInterpretation = metadata?.paiInterpretation;
    const mmpi2rfInterpretation = metadata?.mmpi2rfInterpretation;

    // Generate logo as base64
    let logoBase64 = '';
    if (center?.logo_url) {
      logoBase64 = await fetchImageAsBase64(center.logo_url) || '';
    }

    const html = generateAssessmentHTML({
      assessment,
      patient,
      professional,
      center,
      template,
      factorScores,
      answers,
      paiInterpretation,
      mmpi2rfInterpretation,
      logoBase64,
    });

    return new Response(
      JSON.stringify({
        html,
        assessment: {
          id: assessment.id,
          patient: `${patient.first_name} ${patient.last_name}`,
          template: template.name,
          completed_at: assessment.completed_at,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating assessment PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface GenerateHTMLParams {
  assessment: any;
  patient: any;
  professional: any;
  center: any;
  template: any;
  factorScores: Record<string, number>;
  answers: Record<string, any>;
  paiInterpretation?: any;
  mmpi2rfInterpretation?: any;
  logoBase64: string;
}

function generateAssessmentHTML(params: GenerateHTMLParams): string {
  const { assessment, patient, professional, center, template, factorScores, answers, paiInterpretation, mmpi2rfInterpretation, logoBase64 } = params;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const templateCode = template.code;
  const isSCL90 = templateCode === 'SCL90_V1';
  const isPAI = templateCode === 'PAI_V1';
  const isMMPI2RF = templateCode === 'MMPI2RF';
  const flagThreshold = template.flag_threshold || 4;
  const factorOrder = getFactorOrder(templateCode);

  // Calculate high factors
  const highFactors = factorOrder
    .filter(code => factorScores[code] !== undefined && isAlert(factorScores[code], flagThreshold))
    .map(code => ({ code, score: factorScores[code] }))
    .sort((a, b) => b.score - a.score);

  // Generate factor scores table
  let factorScoresHTML = '';
  if (Object.keys(factorScores).length > 0 && !isMMPI2RF) {
    const rows = factorOrder
      .filter(code => factorScores[code] !== undefined)
      .map(code => {
        const score = factorScores[code];
        const level = computeLevel(score, flagThreshold);
        const alert = isAlert(score, flagThreshold);
        const levelClass = level === 'alto' ? 'level-high' : level === 'moderado' ? 'level-moderate' : 'level-low';
        return `
          <tr>
            <td><strong>${code}</strong> - ${FACTOR_LABELS[code]?.label || code}</td>
            <td class="amount">${score.toFixed(2)}</td>
            <td class="amount ${levelClass}">${level.charAt(0).toUpperCase() + level.slice(1)}</td>
            <td class="amount">${alert ? '<span class="alert-badge">Alerta</span>' : '<span class="ok-badge">OK</span>'}</td>
          </tr>
        `;
      }).join('');

    factorScoresHTML = `
      <div class="section">
        <h3>Puntuaciones por ${isSCL90 ? 'Dimensión' : 'Factor'}</h3>
        <table>
          <thead>
            <tr>
              <th>${isSCL90 ? 'Dimensión' : 'Factor'}</th>
              <th class="amount">Puntuación</th>
              <th class="amount">Nivel</th>
              <th class="amount">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p class="note">Umbral de alerta: > ${flagThreshold.toFixed(2)}</p>
      </div>
    `;
  }

  // Generate SCL-90 global indices
  let globalIndicesHTML = '';
  if (isSCL90) {
    const globalRows = SCL90_GLOBAL_ORDER
      .filter(code => factorScores[code] !== undefined)
      .map(code => {
        const score = factorScores[code];
        const isPST = code === 'PST';
        return `
          <div class="global-index">
            <div class="index-value">${isPST ? Math.round(score) : score.toFixed(2)}</div>
            <div class="index-label">${FACTOR_LABELS[code]?.label || code}</div>
            <div class="index-desc">${FACTOR_LABELS[code]?.description || ''}</div>
          </div>
        `;
      }).join('');

    if (globalRows) {
      globalIndicesHTML = `
        <div class="section">
          <h3>Índices Globales</h3>
          <div class="global-indices">
            ${globalRows}
          </div>
        </div>
      `;
    }
  }

  // Generate interpretation section
  let interpretationHTML = '';
  
  // For PAI with stored AI interpretation
  if (isPAI && paiInterpretation) {
    interpretationHTML = generatePAIInterpretationHTML(paiInterpretation);
  }
  // For MMPI-2-RF with stored AI interpretation
  else if (isMMPI2RF && mmpi2rfInterpretation) {
    interpretationHTML = generateMMPI2RFInterpretationHTML(mmpi2rfInterpretation);
  }
  // For standard tests with high factors
  else if (highFactors.length > 0 && !isMMPI2RF && !isPAI) {
    const factorCards = highFactors.map(({ code, score }) => {
      const texts = INTERPRETATION_TEXTS[code];
      if (!texts) return '';
      
      return `
        <div class="interpretation-card">
          <h4>${code} — ${FACTOR_LABELS[code]?.label || code} <span class="score-badge">${score.toFixed(2)}</span></h4>
          <p>${texts.interpretation}</p>
          <div class="interventions">
            <strong>Líneas de intervención sugeridas:</strong>
            <ul>
              ${texts.interventions.map(i => `<li>${i}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    }).join('');

    interpretationHTML = `
      <div class="section">
        <h3>Interpretación y Sugerencias de Intervención</h3>
        ${factorCards}
      </div>
    `;
  }

  // Generate MMPI-2-RF summary (response pattern only, no detailed interpretation without AI)
  let mmpi2rfSummaryHTML = '';
  if (isMMPI2RF && Object.keys(answers).length > 0) {
    const totalItems = Object.keys(answers).length;
    const trueCount = Object.values(answers).filter(v => v === 1).length;
    const falseCount = Object.values(answers).filter(v => v === 0).length;
    const truePercent = ((trueCount / totalItems) * 100).toFixed(1);

    mmpi2rfSummaryHTML = `
      <div class="section">
        <h3>Resumen de Respuestas MMPI-2-RF</h3>
        <div class="mmpi-summary">
          <div class="summary-item">
            <div class="summary-value">${totalItems}</div>
            <div class="summary-label">Total ítems</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${trueCount}</div>
            <div class="summary-label">Verdadero</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${falseCount}</div>
            <div class="summary-label">Falso</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">${truePercent}%</div>
            <div class="summary-label">Tasa V</div>
          </div>
        </div>
        ${!mmpi2rfInterpretation ? '<p class="note">Para una interpretación completa, genere el análisis con IA desde la plataforma.</p>' : ''}
      </div>
    `;
  }

  // Generate answers detail
  let answersHTML = '';
  const templateItems = template.items || [];
  if (templateItems.length > 0 && Object.keys(answers).length > 0) {
    // For MMPI-2-RF, show compact format
    if (isMMPI2RF) {
      const answersList = templateItems
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => {
          const answer = answers[item.index?.toString()];
          return `<span class="answer-chip">${item.index}: ${answer === 1 ? 'V' : answer === 0 ? 'F' : '—'}</span>`;
        }).join('');

      answersHTML = `
        <div class="section">
          <h3>Detalle de Respuestas</h3>
          <div class="answers-compact">
            ${answersList}
          </div>
        </div>
      `;
    } else {
      const answerRows = templateItems
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => {
          const answer = answers[item.index?.toString()];
          return `
            <div class="answer-row">
              <span class="answer-index">${item.index}.</span>
              <span class="answer-text">${item.text}</span>
              <span class="answer-value">${answer !== undefined ? answer : '—'}</span>
            </div>
          `;
        }).join('');

      answersHTML = `
        <div class="section answers-section">
          <h3>Detalle de Respuestas</h3>
          <div class="answers-list">
            ${answerRows}
          </div>
        </div>
      `;
    }
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Evaluación - ${template.name} - ${patient.first_name} ${patient.last_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #333; padding: 25px; }
    .report { max-width: 800px; margin: 0 auto; }
    
    .header { display: flex; justify-content: space-between; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid #6366f1; }
    .company-info h1 { font-size: 18px; color: #6366f1; margin-bottom: 4px; }
    .company-info p { font-size: 10px; color: #666; margin-bottom: 2px; }
    .report-info { text-align: right; }
    .report-info h2 { font-size: 14px; color: #6366f1; margin-bottom: 4px; }
    .report-info .report-type { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .report-info p { font-size: 10px; color: #666; margin-bottom: 2px; }
    
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px; }
    .info-box { background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 3px solid #6366f1; }
    .info-box h4 { font-size: 9px; text-transform: uppercase; color: #666; margin-bottom: 4px; letter-spacing: 0.5px; }
    .info-box p { font-size: 11px; margin-bottom: 2px; }
    
    .section { margin-bottom: 25px; page-break-inside: avoid; }
    .section h3 { font-size: 13px; color: #1e293b; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #f1f5f9; padding: 8px 6px; text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
    .amount { text-align: center; }
    
    .level-high { color: #dc2626; font-weight: 600; }
    .level-moderate { color: #d97706; font-weight: 600; }
    .level-low { color: #16a34a; font-weight: 600; }
    
    .alert-badge { background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    .ok-badge { background: #f0fdf4; color: #16a34a; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    
    .global-indices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .global-index { text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .index-value { font-size: 24px; font-weight: bold; color: #6366f1; }
    .index-label { font-size: 10px; font-weight: 600; color: #1e293b; margin-top: 4px; }
    .index-desc { font-size: 8px; color: #64748b; margin-top: 2px; }
    
    .interpretation-card { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 12px; border-radius: 0 6px 6px 0; }
    .interpretation-card h4 { font-size: 11px; color: #92400e; margin-bottom: 8px; }
    .interpretation-card p { font-size: 10px; color: #78350f; margin-bottom: 8px; }
    .score-badge { background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; margin-left: 8px; }
    .interventions { font-size: 10px; }
    .interventions ul { margin-left: 16px; margin-top: 6px; }
    .interventions li { margin-bottom: 3px; color: #78350f; }
    
    .mmpi-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .summary-item { text-align: center; padding: 12px; background: #f8fafc; border-radius: 8px; }
    .summary-value { font-size: 20px; font-weight: bold; color: #6366f1; }
    .summary-label { font-size: 9px; color: #64748b; margin-top: 4px; }
    
    .answers-section { page-break-before: always; }
    .answers-list { columns: 2; column-gap: 20px; }
    .answer-row { display: flex; align-items: flex-start; padding: 4px 0; border-bottom: 1px solid #f1f5f9; break-inside: avoid; }
    .answer-index { font-weight: 600; color: #6366f1; min-width: 24px; font-size: 9px; }
    .answer-text { flex: 1; font-size: 9px; color: #475569; padding-right: 8px; }
    .answer-value { font-weight: 600; min-width: 24px; text-align: center; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 9px; }
    
    .answers-compact { display: flex; flex-wrap: wrap; gap: 4px; }
    .answer-chip { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-family: monospace; }
    
    .ai-interpretation { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 15px; margin-bottom: 12px; }
    .ai-interpretation h4 { font-size: 11px; color: #7c3aed; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .ai-section { margin-bottom: 12px; }
    .ai-section h5 { font-size: 10px; color: #5b21b6; margin-bottom: 6px; border-bottom: 1px solid #e9d5ff; padding-bottom: 4px; }
    .ai-section p { font-size: 10px; color: #4c1d95; margin-bottom: 4px; }
    .ai-section ul { margin-left: 16px; font-size: 10px; color: #4c1d95; }
    .ai-section li { margin-bottom: 2px; }
    .validity-valid { color: #16a34a; }
    .validity-questionable { color: #d97706; }
    .validity-invalid { color: #dc2626; }
    .risk-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; margin-right: 6px; }
    .risk-alto { background: #fef2f2; color: #dc2626; }
    .risk-moderado { background: #fffbeb; color: #d97706; }
    .risk-bajo { background: #f0fdf4; color: #16a34a; }
    
    .note { font-size: 9px; color: #64748b; font-style: italic; margin-top: 8px; }
    
    .footer { text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 30px; }
    .footer .confidential { color: #dc2626; font-weight: 500; margin-bottom: 6px; }
    
    @media print { 
      body { padding: 15px; } 
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <div class="company-info">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height: 50px; margin-bottom: 6px;" />` : ''}
        <h1>${center?.name || 'Centro'}</h1>
        ${center?.address ? `<p>${center.address}</p>` : ''}
        ${center?.city || center?.postal_code ? `<p>${center.postal_code || ''} ${center.city || ''}</p>` : ''}
        ${center?.phone ? `<p>Tel: ${center.phone}</p>` : ''}
        ${center?.email ? `<p>${center.email}</p>` : ''}
      </div>
      <div class="report-info">
        <p class="report-type">Informe de Evaluación Psicológica</p>
        <h2>${template.name}</h2>
        <p><strong>Código:</strong> ${templateCode}</p>
        ${assessment.completed_at ? `<p><strong>Fecha:</strong> ${formatDate(assessment.completed_at)}</p>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Paciente</h4>
        <p><strong>${patient.first_name} ${patient.last_name}</strong></p>
        ${patient.date_of_birth ? `<p>Fecha nacimiento: ${formatDate(patient.date_of_birth)}</p>` : ''}
        ${patient.gender ? `<p>Género: ${patient.gender === 'male' ? 'Masculino' : patient.gender === 'female' ? 'Femenino' : patient.gender}</p>` : ''}
        ${patient.email ? `<p>${patient.email}</p>` : ''}
      </div>
      <div class="info-box">
        <h4>Profesional</h4>
        <p><strong>${professional?.first_name || ''} ${professional?.last_name || ''}</strong></p>
        ${professional?.collegiate_number ? `<p>Nº Colegiado: ${professional.collegiate_number}</p>` : ''}
      </div>
    </div>

    ${globalIndicesHTML}
    ${factorScoresHTML}
    ${mmpi2rfSummaryHTML}
    ${interpretationHTML}
    ${answersHTML}

    <div class="footer">
      <p class="confidential">⚠️ DOCUMENTO CONFIDENCIAL - USO PROFESIONAL EXCLUSIVO</p>
      <p>Este informe contiene información clínica protegida. Su distribución no autorizada está prohibida.</p>
      <p style="margin-top: 8px;">Generado por Psycma · Sistema de Gestión Clínica · ${formatDate(new Date().toISOString())}</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generatePAIInterpretationHTML(interpretation: any): string {
  if (!interpretation) return '';

  const validityClass = interpretation.validez?.estado === 'válido' ? 'validity-valid' 
    : interpretation.validez?.estado === 'cuestionable' ? 'validity-questionable' : 'validity-invalid';

  const getRiskClass = (nivel: string) => {
    const n = nivel?.toLowerCase();
    if (n === 'alto') return 'risk-alto';
    if (n === 'moderado') return 'risk-moderado';
    return 'risk-bajo';
  };

  return `
    <div class="section">
      <h3>🤖 Interpretación Clínica IA - PAI</h3>
      <div class="ai-interpretation">
        ${interpretation.resumenEjecutivo ? `
          <div class="ai-section">
            <h5>Resumen Ejecutivo</h5>
            <p>${interpretation.resumenEjecutivo}</p>
          </div>
        ` : ''}

        ${interpretation.validez ? `
          <div class="ai-section">
            <h5>Validez del Protocolo</h5>
            <p><strong class="${validityClass}">Estado: ${interpretation.validez.estado?.toUpperCase()}</strong></p>
            <p>${interpretation.validez.observaciones || ''}</p>
          </div>
        ` : ''}

        ${interpretation.riesgos ? `
          <div class="ai-section">
            <h5>Evaluación de Riesgos</h5>
            <p>
              <span class="risk-badge ${getRiskClass(interpretation.riesgos.nivelGlobal)}">Nivel Global: ${interpretation.riesgos.nivelGlobal?.toUpperCase()}</span>
            </p>
            ${interpretation.riesgos.suicidio ? `<p><strong>Suicidio (${interpretation.riesgos.suicidio.nivel}):</strong> ${interpretation.riesgos.suicidio.observaciones}</p>` : ''}
            ${interpretation.riesgos.violencia ? `<p><strong>Violencia (${interpretation.riesgos.violencia.nivel}):</strong> ${interpretation.riesgos.violencia.observaciones}</p>` : ''}
            ${interpretation.riesgos.descompensacion ? `<p><strong>Descompensación (${interpretation.riesgos.descompensacion.nivel}):</strong> ${interpretation.riesgos.descompensacion.observaciones}</p>` : ''}
          </div>
        ` : ''}

        ${interpretation.perfilClinico?.escalasElevadas?.length > 0 ? `
          <div class="ai-section">
            <h5>Escalas Elevadas</h5>
            <ul>
              ${interpretation.perfilClinico.escalasElevadas.map((e: any) => 
                `<li><strong>${e.escala} (T=${e.puntuacionT}):</strong> ${e.interpretacion}</li>`
              ).join('')}
            </ul>
          </div>
        ` : ''}

        ${interpretation.perfilClinico?.formulacionIntegrada ? `
          <div class="ai-section">
            <h5>Formulación Integrada</h5>
            <p>${interpretation.perfilClinico.formulacionIntegrada}</p>
          </div>
        ` : ''}

        ${interpretation.hipotesisDiagnosticas?.length > 0 ? `
          <div class="ai-section">
            <h5>Hipótesis Diagnósticas</h5>
            <ul>
              ${interpretation.hipotesisDiagnosticas.map((h: string) => `<li>${h}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${interpretation.intervenciones ? `
          <div class="ai-section">
            <h5>Recomendaciones de Intervención</h5>
            ${interpretation.intervenciones.prioridades?.length > 0 ? `
              <p><strong>Prioridades:</strong></p>
              <ul>${interpretation.intervenciones.prioridades.map((p: string) => `<li>${p}</li>`).join('')}</ul>
            ` : ''}
            ${interpretation.intervenciones.enfoqueSugerido ? `<p><strong>Enfoque sugerido:</strong> ${interpretation.intervenciones.enfoqueSugerido}</p>` : ''}
            ${interpretation.intervenciones.precauciones?.length > 0 ? `
              <p><strong>Precauciones:</strong></p>
              <ul>${interpretation.intervenciones.precauciones.map((p: string) => `<li>${p}</li>`).join('')}</ul>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function generateMMPI2RFInterpretationHTML(interpretation: any): string {
  if (!interpretation) return '';

  const validityClass = interpretation.validez?.estado === 'válido' ? 'validity-valid' 
    : interpretation.validez?.estado === 'cuestionable' ? 'validity-questionable' : 'validity-invalid';

  const getRiskClass = (nivel: string) => {
    const n = nivel?.toLowerCase();
    if (n === 'alto') return 'risk-alto';
    if (n === 'moderado') return 'risk-moderado';
    return 'risk-bajo';
  };

  return `
    <div class="section">
      <h3>🤖 Interpretación Clínica IA - MMPI-2-RF</h3>
      <div class="ai-interpretation">
        ${interpretation.resumenEjecutivo ? `
          <div class="ai-section">
            <h5>Resumen Ejecutivo</h5>
            <p>${interpretation.resumenEjecutivo}</p>
          </div>
        ` : ''}

        ${interpretation.validez ? `
          <div class="ai-section">
            <h5>Validez del Protocolo</h5>
            <p><strong class="${validityClass}">Estado: ${interpretation.validez.estado?.toUpperCase()}</strong></p>
            <p>${interpretation.validez.observaciones || ''}</p>
            ${interpretation.validez.escalasProblematicas?.length > 0 ? `
              <p><strong>Escalas problemáticas:</strong> ${interpretation.validez.escalasProblematicas.join(', ')}</p>
            ` : ''}
          </div>
        ` : ''}

        ${interpretation.riesgos ? `
          <div class="ai-section">
            <h5>Evaluación de Riesgos</h5>
            <p>
              <span class="risk-badge ${getRiskClass(interpretation.riesgos.nivelGlobal)}">Nivel Global: ${interpretation.riesgos.nivelGlobal?.toUpperCase()}</span>
            </p>
            ${interpretation.riesgos.suicidio ? `<p><strong>Suicidio (${interpretation.riesgos.suicidio.nivel}):</strong> ${interpretation.riesgos.suicidio.observaciones}</p>` : ''}
            ${interpretation.riesgos.violencia ? `<p><strong>Violencia (${interpretation.riesgos.violencia.nivel}):</strong> ${interpretation.riesgos.violencia.observaciones}</p>` : ''}
            ${interpretation.riesgos.descompensacion ? `<p><strong>Descompensación (${interpretation.riesgos.descompensacion.nivel}):</strong> ${interpretation.riesgos.descompensacion.observaciones}</p>` : ''}
          </div>
        ` : ''}

        ${interpretation.perfilClinico?.escalasElevadas?.length > 0 ? `
          <div class="ai-section">
            <h5>Escalas Elevadas</h5>
            <ul>
              ${interpretation.perfilClinico.escalasElevadas.map((e: any) => 
                `<li><strong>${e.escala} (T=${e.puntuacionT}):</strong> ${e.interpretacion}</li>`
              ).join('')}
            </ul>
          </div>
        ` : ''}

        ${interpretation.perfilClinico?.formulacionIntegrada ? `
          <div class="ai-section">
            <h5>Formulación Integrada</h5>
            <p>${interpretation.perfilClinico.formulacionIntegrada}</p>
          </div>
        ` : ''}

        ${interpretation.hipotesisDiagnosticas?.length > 0 ? `
          <div class="ai-section">
            <h5>Hipótesis Diagnósticas</h5>
            <ul>
              ${interpretation.hipotesisDiagnosticas.map((h: string) => `<li>${h}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${interpretation.intervenciones ? `
          <div class="ai-section">
            <h5>Recomendaciones de Intervención</h5>
            ${interpretation.intervenciones.prioridades?.length > 0 ? `
              <p><strong>Prioridades:</strong></p>
              <ul>${interpretation.intervenciones.prioridades.map((p: string) => `<li>${p}</li>`).join('')}</ul>
            ` : ''}
            ${interpretation.intervenciones.enfoqueSugerido ? `<p><strong>Enfoque sugerido:</strong> ${interpretation.intervenciones.enfoqueSugerido}</p>` : ''}
            ${interpretation.intervenciones.precauciones?.length > 0 ? `
              <p><strong>Precauciones:</strong></p>
              <ul>${interpretation.intervenciones.precauciones.map((p: string) => `<li>${p}</li>`).join('')}</ul>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

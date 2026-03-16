import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =====================================================
// REUSABLE RENDER HELPERS
// =====================================================

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderString(value: any, fallback = 'Sin respuesta'): string {
  if (value === null || value === undefined || value === '') return `<em>${fallback}</em>`;
  return escapeHtml(String(value)).replace(/\n/g, '<br>');
}

function renderBoolean(value: any, trueLabel = 'Sí', falseLabel = 'No'): string {
  if (value === 'si' || value === true) return trueLabel;
  if (value === 'no' || value === false) return falseLabel;
  return '<em>Sin respuesta</em>';
}

function renderBadgeList(items: string[], colorClass = 'badge-neutral'): string {
  if (!Array.isArray(items) || items.length === 0) return '<em>Ninguno</em>';
  return `<div class="badge-list">${items.map(i => `<span class="badge ${colorClass}">${escapeHtml(i)}</span>`).join('')}</div>`;
}

function renderNarrative(label: string, value: any): string {
  if (!value && value !== 0) return '';
  return `
    <div class="narrative-block">
      <p class="narrative-label">${escapeHtml(label)}</p>
      <div class="narrative-content">${renderString(value)}</div>
    </div>
  `;
}

function renderConditionalNarrative(label: string, value: any): string {
  if (!value && value !== 0) return '';
  return renderNarrative(label, value);
}

function renderSection(title: string, content: string): string {
  if (!content || content.trim() === '') return '';
  return `
    <div class="section">
      <h3>${escapeHtml(title)}</h3>
      ${content}
    </div>
  `;
}

function renderSubsection(title: string, content: string): string {
  if (!content || content.trim() === '') return '';
  return `
    <div class="subsection">
      <h4>${escapeHtml(title)}</h4>
      ${content}
    </div>
  `;
}

function renderKeyValue(label: string, value: any): string {
  if (value === null || value === undefined || value === '') return '';
  return `<p><strong>${escapeHtml(label)}:</strong> ${renderString(value)}</p>`;
}

function renderFactorScoresTable(
  factorScores: Record<string, number>,
  factorOrder: string[],
  factorLabels: Record<string, { label: string; description?: string }>,
  threshold: number,
  dimensionLabel = 'Factor'
): string {
  const rows = factorOrder
    .filter(code => factorScores[code] !== undefined)
    .map(code => {
      const score = factorScores[code];
      const level = computeLevel(score, threshold);
      const alert = score > threshold;
      const levelClass = level === 'alto' ? 'level-high' : level === 'moderado' ? 'level-moderate' : 'level-low';
      return `
        <tr>
          <td><strong>${escapeHtml(code)}</strong> - ${escapeHtml(factorLabels[code]?.label || code)}</td>
          <td class="amount">${score.toFixed(2)}</td>
          <td class="amount ${levelClass}">${level.charAt(0).toUpperCase() + level.slice(1)}</td>
          <td class="amount">${alert ? '<span class="alert-badge">Alerta</span>' : '<span class="ok-badge">OK</span>'}</td>
        </tr>
      `;
    }).join('');

  if (!rows) return '';

  return `
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(dimensionLabel)}</th>
          <th class="amount">Puntuación</th>
          <th class="amount">Nivel</th>
          <th class="amount">Estado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">Umbral de alerta: > ${threshold.toFixed(2)}</p>
  `;
}

// =====================================================
// FACTOR LABELS & INTERPRETATION DATA
// =====================================================

const FACTOR_LABELS: Record<string, { label: string; description: string }> = {
  AD: { label: 'Conducta Autodestructiva', description: 'Patrón de autocuidado invertido' },
  TA: { label: 'Falta de tolerancia al afecto positivo', description: 'Dificultad para recibir elogios' },
  PA: { label: 'Problemas para dejarse ayudar', description: 'Autosuficiencia defensiva' },
  R: { label: 'Resentimiento por no reciprocidad', description: 'Sensación de injusticia' },
  NP: { label: 'No actividades positivas', description: 'Dificultad para priorizar placer' },
  NN: { label: 'No atender las propias necesidades', description: 'Prioriza necesidades ajenas' },
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
  AD: { interpretation: 'Patrón de autocuidado invertido: cuando se encuentra peor, tiende a tratarse peor.', interventions: ['Autocuidado cognitivo: entrenar un diálogo interno más compasivo.', 'Explorar origen y función de la voz crítica.', 'Trabajo con partes/niño interior.', 'Plan de reducción de conductas de riesgo.'] },
  TA: { interpretation: 'Dificultad para recibir elogios, reconocimiento o afecto positivo.', interventions: ['Detectar y procesar bloqueos ante el elogio.', 'Ejercicios graduados de aceptación del reconocimiento.', 'Instalación de recursos de valía/aceptación.', 'Trabajo con vergüenza asociada.'] },
  PA: { interpretation: 'Puede reflejar autosuficiencia defensiva y desconfianza básica.', interventions: ['Reforzar seguridad y confianza en el vínculo terapéutico.', 'Validar la necesidad legítima de apoyo.', 'Reestructurar creencias tipo "pedir ayuda es debilidad".', 'Ensayar peticiones en contextos seguros.'] },
  R: { interpretation: 'Sensación de injusticia y frustración porque los demás no responden como se espera.', interventions: ['Ajustar expectativas y diferenciar pasado vs presente.', 'Clarificar necesidades actuales.', 'Explorar límites y acuerdos en relaciones.', 'Fomentar responsabilidad personal.'] },
  NP: { interpretation: 'Dificultad para priorizar placer y actividades agradables.', interventions: ['Programación gradual de actividades agradables.', 'Identificar culpa asociada al disfrute.', 'Entrenar habilidades de disfrute/descanso consciente.', 'Revisar barreras prácticas.'] },
  NN: { interpretation: 'Prioriza necesidades ajenas sobre las propias.', interventions: ['Entrenamiento en asertividad y límites.', 'Legitimación de necesidades propias.', 'Diferenciar "ser buena persona" de "dejarse invadir".', 'Ensayar frases de protección del espacio personal.'] },
  SOM: { interpretation: 'Elevado nivel de síntomas somáticos.', interventions: ['Psicoeducación sobre la conexión mente-cuerpo.', 'Técnicas de relajación y respiración.', 'Explorar factores emocionales.', 'Valorar derivación médica.'] },
  OBS: { interpretation: 'Presencia significativa de pensamientos intrusivos.', interventions: ['Técnicas de exposición con prevención de respuesta.', 'Reestructuración cognitiva.', 'Mindfulness para desapego.', 'Valorar tratamiento farmacológico.'] },
  SEN: { interpretation: 'Alta sensibilidad al rechazo y evaluación negativa.', interventions: ['Trabajo con autoestima y autoimagen.', 'Exposición gradual a situaciones sociales.', 'Reestructuración de creencias sobre evaluación social.', 'Entrenamiento en habilidades sociales.'] },
  DEP: { interpretation: 'Síntomas depresivos significativos.', interventions: ['Activación conductual gradual.', 'Reestructuración de pensamientos negativos.', 'Evaluar ideación autolítica.', 'Valorar tratamiento farmacológico.'] },
  ANS: { interpretation: 'Elevados niveles de ansiedad.', interventions: ['Psicoeducación sobre la respuesta de ansiedad.', 'Técnicas de relajación y respiración.', 'Exposición gradual.', 'Reestructuración de pensamientos catastróficos.'] },
  HOS: { interpretation: 'Presencia de hostilidad, irritabilidad e ira.', interventions: ['Técnicas de control de la ira.', 'Identificar desencadenantes.', 'Entrenamiento en comunicación asertiva.', 'Explorar fuentes subyacentes de frustración.'] },
  FOB: { interpretation: 'Miedos fóbicos significativos.', interventions: ['Jerarquía de exposición gradual.', 'Técnicas de afrontamiento.', 'Reestructuración de creencias sobre el peligro.', 'Considerar EMDR si hay trauma asociado.'] },
  PAR: { interpretation: 'Tendencia a la suspicacia y desconfianza.', interventions: ['Explorar experiencias pasadas.', 'Trabajo con distorsiones cognitivas.', 'Construir experiencias relacionales seguras.', 'Evaluar contexto actual de relaciones.'] },
  PSI: { interpretation: 'Presencia de síntomas del espectro psicótico.', interventions: ['Evaluación exhaustiva de síntomas psicóticos.', 'Valorar derivación a psiquiatría.', 'Trabajo con síntomas disociativos.', 'Intervención temprana si síndrome prodrómico.'] },
};

const FACTOR_ORDER = ['AD', 'TA', 'PA', 'R', 'NP', 'NN'];
const SCL90_FACTOR_ORDER = ['SOM', 'OBS', 'SEN', 'DEP', 'ANS', 'HOS', 'FOB', 'PAR', 'PSI'];
const SCL90_GLOBAL_ORDER = ['GSI', 'PST', 'PSDI'];

function getFactorOrder(templateCode: string): string[] {
  if (templateCode === 'SCL90_V1') return SCL90_FACTOR_ORDER;
  return FACTOR_ORDER;
}

function computeLevel(score: number, threshold: number): 'bajo' | 'moderado' | 'alto' {
  if (score > threshold) return 'alto';
  if (score > threshold * 0.75) return 'moderado';
  return 'bajo';
}

// =====================================================
// EMO REGULATION/RELATIONAL INDICATORS (mirrored from emo-template.ts)
// =====================================================

const REGULATION_INDICATORS: Record<string, { label: string; patterns: string[] }> = {
  supresion_evitacion: { label: 'Supresión/Evitación', patterns: ['Evito sentir algunas cosas', 'Tiendo a suprimir o anular determinadas emociones', 'Me siento como anestesiado a nivel emocional'] },
  hiperactivacion_desborde: { label: 'Hiperactivación/Desborde', patterns: ['Algunas de mis emociones suelen desbordarse', 'Mis emociones están siempre a flor de piel', 'Mis emociones son demasiado intensas'] },
  confusion_emocional: { label: 'Confusión emocional', patterns: ['En general no sé muy bien lo que siento'] },
  rumiacion_emocional: { label: 'Rumiación emocional', patterns: ['Le doy vueltas y vueltas a cómo me siento'] },
  contagio_emocional: { label: 'Contagio emocional', patterns: ['Tiendo a contagiarme de las emociones de los demás'] },
  verguenza_autocritica: { label: 'Vergüenza/Auto-crítica emocional', patterns: ['A veces me avergüenzo de lo que puedo llegar a sentir', 'Me enfado conmigo mismo por sentir determinadas emociones'] },
};

const RELATIONAL_INDICATORS: Record<string, { label: string; reactions?: string[]; feelings?: string[] }> = {
  invalidacion: { label: 'Invalidación', reactions: ['Me decía "no tienes que ponerte así"', 'Me decía que no pasaba nada', 'Dejaba de hablarme o me ignoraba'] },
  verguenza_inducida: { label: 'Vergüenza inducida', reactions: ['Me avergonzaba por sentirme así'] },
  culpa_inducida: { label: 'Culpa inducida', reactions: ['Me hacía sentir culpable por sentirme así'] },
  rechazo_ausencia: { label: 'Rechazo/Ausencia', feelings: ['Rechazado', 'Invisible'], reactions: ['Dejaba de hablarme o me ignoraba', 'Ni se enteraba de cómo me sentía'] },
};

const FIGURE_FEELINGS_POSITIVE = ['Entendido', 'Aceptado', 'Valorado', 'Especial', 'Importante', 'Protegido', 'Apoyado', 'Seguro'];
const FIGURE_FEELINGS_NEGATIVE = ['Rechazado', 'Atemorizado', 'Inseguro', 'Invisible', 'Avergonzado', 'Humillado', 'Traicionado', 'Inútil', 'Ridículo', 'Culpable'];

const EMOTION_MATRIX_EMOTIONS = ['Alegría', 'Tristeza', 'Rabia', 'Miedo', 'Vergüenza', 'Asco', 'Preocupación'];
const EMOTION_MATRIX_COLUMNS = ['Era frecuente verla así', 'Era raro verla así', 'Aceptaba que yo estuviera así', 'No le gustaba verme así'];

function calculateEMOIndicators(answers: any) {
  const allPatterns = [...(answers.emo_patrones_1 || []), ...(answers.emo_patrones_2 || [])];

  const regulation = Object.entries(REGULATION_INDICATORS).map(([id, config]) => {
    const matchedPatterns = config.patterns.filter(p => allPatterns.includes(p));
    return { id, label: config.label, detected: matchedPatterns.length > 0, matchedPatterns };
  });

  const relational = (answers.figures || []).map((figure: any) => {
    const feelings = figure.figure_feelings_words || [];
    const reactions = figure.figure_reactions_to_your_emotion || [];

    const indicators = Object.entries(RELATIONAL_INDICATORS).map(([id, config]) => {
      let detected = false;
      if (config.reactions) detected = config.reactions.some(r => reactions.includes(r));
      if (config.feelings && !detected) detected = config.feelings.some(f => feelings.includes(f));
      return { id, label: config.label, detected };
    });

    const positiveCount = feelings.filter((f: string) => FIGURE_FEELINGS_POSITIVE.includes(f)).length;
    const negativeCount = feelings.filter((f: string) => FIGURE_FEELINGS_NEGATIVE.includes(f)).length;

    return { figureId: figure.id, figureName: figure.figure_name || figure.figure_relation || 'Sin nombre', indicators, positiveCount, negativeCount };
  });

  return { regulation, relational };
}

// =====================================================
// EMO SPECIFIC RENDERER
// =====================================================

function generateEMOHTML(answers: Record<string, any>, factorScores: Record<string, number>, metadata: any): string {
  const sections: string[] = [];
  let sectionCount = 0;

  // Normalize answers (support legacy keys)
  const emo: any = {
    emo_reg_general: answers['emo_reg_general'] || answers['s1_description'] || answers['1'],
    emo_dificultad_sentir: answers['emo_dificultad_sentir'],
    emo_dificultad_sentir_explicacion: answers['emo_dificultad_sentir_explicacion'],
    emo_emociones_problematicas: answers['emo_emociones_problematicas'] || answers['s1_difficult_emotions'] || answers['3'] || [],
    emo_emociones_problematicas_otro: answers['emo_emociones_problematicas_otro'],
    emo_emociones_problematicas_por_que: answers['emo_emociones_problematicas_por_que'],
    emo_patrones_1: answers['emo_patrones_1'] || [],
    emo_patrones_2: answers['emo_patrones_2'] || [],
    emo_patrones_otro_texto: answers['emo_patrones_otro_texto'],
    emo_desde_cuando: answers['emo_desde_cuando'] || answers['s1_since_when'] || answers['6'],
    emo_empeoro: answers['emo_empeoro'],
    emo_empeoro_cuando: answers['emo_empeoro_cuando'] || answers['s1_worsening_periods'] || answers['7'],
    emo_quienes_crianza: answers['emo_quienes_crianza'],
    emo_cambio_convivencia: answers['emo_cambio_convivencia'],
    emo_cambio_convivencia_detalle: answers['emo_cambio_convivencia_detalle'],
    emo_figuras_fuera_familia: answers['emo_figuras_fuera_familia'],
    emo_figuras_fuera_familia_detalle: answers['emo_figuras_fuera_familia_detalle'],
    emo_cuidadores_contratados: answers['emo_cuidadores_contratados'],
    emo_cuidadores_tiempo: answers['emo_cuidadores_tiempo'],
    emo_internado: answers['emo_internado'],
    emo_internado_detalle: answers['emo_internado_detalle'],
    emo_adopcion: answers['emo_adopcion'],
    emo_adopcion_detalle: answers['emo_adopcion_detalle'],
    emo_figuras_positivas: answers['emo_figuras_positivas'],
    emo_figuras_negativas: answers['emo_figuras_negativas'],
    emo_figuras_ausentes: answers['emo_figuras_ausentes'],
    emo_momentos_coregulacion: answers['emo_momentos_coregulacion'] || [],
    figures: answers['figures'] || [],
  };

  const indicators = calculateEMOIndicators(emo);
  const detectedRegulation = indicators.regulation.filter(r => r.detected);
  const allPatterns = [...(emo.emo_patrones_1 || []), ...(emo.emo_patrones_2 || [])];
  const uniquePatterns = [...new Set(allPatterns)];

  // Determine predominant pattern
  const hasHipo = detectedRegulation.some(r => r.id === 'supresion_evitacion');
  const hasHiper = detectedRegulation.some(r => r.id === 'hiperactivacion_desborde');
  const patternLabel = hasHipo && hasHiper ? 'Mixto' : hasHipo ? 'Hipoactivación' : hasHiper ? 'Hiperactivación' : 'No definido';

  // ===== SUMMARY =====
  const problematicEmotions = emo.emo_emociones_problematicas || [];
  const figuresData = emo.figures || [];

  sections.push(`
    <div class="section">
      <h3>Resumen de la Evaluación EMO</h3>
      <div class="global-indices" style="grid-template-columns: repeat(4, 1fr);">
        <div class="global-index">
          <div class="index-value">${problematicEmotions.length}</div>
          <div class="index-label">Emociones Problemáticas</div>
        </div>
        <div class="global-index">
          <div class="index-value">${detectedRegulation.length}</div>
          <div class="index-label">Indicadores Detectados</div>
        </div>
        <div class="global-index">
          <div class="index-value" style="font-size: 18px;">${escapeHtml(patternLabel)}</div>
          <div class="index-label">Patrón Predominante</div>
        </div>
        <div class="global-index">
          <div class="index-value">${figuresData.length}</div>
          <div class="index-label">Figuras Evaluadas</div>
        </div>
      </div>
    </div>
  `);
  sectionCount++;

  // Critical alert
  if (detectedRegulation.length >= 4) {
    sections.push(`
      <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <p style="color: #dc2626; font-weight: bold; margin-bottom: 4px;">⚠️ PATRÓN DE DISREGULACIÓN SIGNIFICATIVO</p>
        <p style="font-size: 10px; color: #7f1d1d;">Se han identificado múltiples indicadores de dificultades en la regulación emocional (${detectedRegulation.length} detectados).</p>
      </div>
    `);
  }

  // ===== SECTION 1: REGULATION INDICATORS =====
  {
    let content = '';
    // Detected indicators
    content += '<div style="margin-bottom: 16px;">';
    indicators.regulation.forEach(ind => {
      const bg = ind.detected ? 'background: #fffbeb; border: 1px solid #f59e0b;' : 'background: #f8fafc; border: 1px solid #e2e8f0;';
      content += `<div style="${bg} border-radius: 6px; padding: 8px 12px; margin-bottom: 6px;">`;
      content += `<span style="font-weight: 600; ${ind.detected ? 'color: #92400e;' : 'color: #94a3b8;'}">${escapeHtml(ind.label)}</span>`;
      if (ind.detected) {
        content += ` <span class="alert-badge" style="margin-left: 8px;">Detectado</span>`;
        if (ind.matchedPatterns.length > 0) {
          content += `<div style="margin-top: 4px;">${renderBadgeList(ind.matchedPatterns, 'badge-amber')}</div>`;
        }
      }
      content += '</div>';
    });
    content += '</div>';

    // All selected patterns
    if (uniquePatterns.length > 0) {
      content += renderSubsection('Todas las afirmaciones seleccionadas', renderBadgeList(uniquePatterns));
    }

    sections.push(renderSection('Indicadores de Regulación Emocional', content));
    sectionCount++;
  }

  // ===== SECTION 2: CURRENT EMOTIONAL REGULATION =====
  {
    let content = '';
    content += renderNarrative('¿Cómo describes tu forma de gestionar emociones?', emo.emo_reg_general);

    if (emo.emo_dificultad_sentir) {
      let respuesta = renderBoolean(emo.emo_dificultad_sentir);
      if (emo.emo_dificultad_sentir_explicacion) respuesta += ` — ${escapeHtml(emo.emo_dificultad_sentir_explicacion)}`;
      content += renderNarrative('¿Te cuesta sentir emociones como otras personas?', respuesta);
    }

    if (problematicEmotions.length > 0) {
      content += renderSubsection('Emociones problemáticas identificadas', renderBadgeList(problematicEmotions, 'badge-red'));
      if (emo.emo_emociones_problematicas_otro) {
        content += renderKeyValue('Otra emoción especificada', emo.emo_emociones_problematicas_otro);
      }
    }

    content += renderConditionalNarrative('¿Por qué son difíciles estas emociones?', emo.emo_emociones_problematicas_por_que);
    content += renderConditionalNarrative('¿Desde cuándo?', emo.emo_desde_cuando);
    
    if (emo.emo_empeoro === 'si' && emo.emo_empeoro_cuando) {
      content += renderNarrative('¿Cuándo empeoró?', emo.emo_empeoro_cuando);
    }

    if (emo.emo_patrones_otro_texto) {
      content += renderConditionalNarrative('Otra tendencia descrita', emo.emo_patrones_otro_texto);
    }

    sections.push(renderSection('Regulación Emocional Actual', content));
    sectionCount++;
  }

  // ===== SECTION 3: UPBRINGING HISTORY =====
  {
    let content = '';
    content += renderConditionalNarrative('Personas con las que se crió', emo.emo_quienes_crianza);
    
    if (emo.emo_cambio_convivencia === 'si') {
      content += renderConditionalNarrative('Cambios de convivencia', emo.emo_cambio_convivencia_detalle || 'Sí (sin detalle)');
    }
    if (emo.emo_figuras_fuera_familia === 'si') {
      content += renderConditionalNarrative('Figuras importantes fuera de la familia', emo.emo_figuras_fuera_familia_detalle || 'Sí (sin detalle)');
    }
    if (emo.emo_cuidadores_contratados === 'si') {
      content += renderConditionalNarrative('Cuidadores contratados', emo.emo_cuidadores_tiempo || 'Sí');
    }
    if (emo.emo_internado === 'si') {
      content += renderConditionalNarrative('Internado o institución', emo.emo_internado_detalle || 'Sí');
    }
    if (emo.emo_adopcion === 'si') {
      content += renderConditionalNarrative('Adopción o acogida', emo.emo_adopcion_detalle || 'Sí');
    }

    content += renderConditionalNarrative('Figuras con influencia positiva', emo.emo_figuras_positivas);
    content += renderConditionalNarrative('Figuras con influencia negativa', emo.emo_figuras_negativas);
    content += renderConditionalNarrative('Figuras que deberían haber estado', emo.emo_figuras_ausentes);

    // Co-regulation moments
    const moments = emo.emo_momentos_coregulacion || [];
    if (moments.length > 0) {
      let momentsHtml = '<table><thead><tr><th>¿Quién?</th><th>Emoción</th><th>¿Qué ayudó?</th></tr></thead><tbody>';
      moments.forEach((m: any) => {
        if (m.who || m.emotion || m.whatHelped) {
          momentsHtml += `<tr><td>${renderString(m.who)}</td><td>${renderString(m.emotion)}</td><td>${renderString(m.whatHelped)}</td></tr>`;
        }
      });
      momentsHtml += '</tbody></table>';
      content += renderSubsection('Momentos de Corregulación', momentsHtml);
    }

    sections.push(renderSection('Historia de Crianza y Figuras Reguladoras', content));
    sectionCount++;
  }

  // ===== SECTION 4: PER-FIGURE ANALYSIS =====
  figuresData.forEach((figure: any, index: number) => {
    let content = '';
    const figureName = figure.figure_name || `Figura ${index + 1}`;
    const figureRelation = figure.figure_relation || '';

    // Relational indicators for this figure
    const figInd = indicators.relational.find(r => r.figureId === figure.id);
    const detectedRelational = figInd?.indicators.filter(i => i.detected) || [];

    if (detectedRelational.length > 0) {
      content += `<div style="background: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
        <p style="font-weight: 600; color: #92400e; margin-bottom: 4px;">⚠️ Indicadores relacionales detectados</p>
        ${renderBadgeList(detectedRelational.map(d => d.label), 'badge-amber')}
      </div>`;
    }

    // Feelings balance
    const feelings = figure.figure_feelings_words || [];
    const positiveFeelings = feelings.filter((f: string) => FIGURE_FEELINGS_POSITIVE.includes(f));
    const negativeFeelings = feelings.filter((f: string) => FIGURE_FEELINGS_NEGATIVE.includes(f));

    if (positiveFeelings.length > 0 || negativeFeelings.length > 0) {
      content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
      content += `<div><p style="font-weight: 600; color: #16a34a; font-size: 10px; margin-bottom: 4px;">Sentimientos positivos (${positiveFeelings.length})</p>${renderBadgeList(positiveFeelings, 'badge-green')}</div>`;
      content += `<div><p style="font-weight: 600; color: #dc2626; font-size: 10px; margin-bottom: 4px;">Sentimientos negativos (${negativeFeelings.length})</p>${renderBadgeList(negativeFeelings, 'badge-red')}</div>`;
      content += '</div>';
    }
    if (figure.figure_feelings_words_otro) {
      content += renderKeyValue('Otro sentimiento', figure.figure_feelings_words_otro);
    }

    // Reactions
    if (figure.figure_reactions_to_your_emotion?.length > 0) {
      content += renderSubsection('Reacciones típicas de la figura', renderBadgeList(figure.figure_reactions_to_your_emotion));
      if (figure.figure_reactions_otro) {
        content += renderKeyValue('Otra reacción', figure.figure_reactions_otro);
      }
    }

    // Adjectives
    if (figure.figure_adjectives?.length > 0) {
      const validAdj = figure.figure_adjectives.filter((a: any) => a.adjective);
      if (validAdj.length > 0) {
        let adjHtml = '<div style="margin-bottom: 8px;">';
        validAdj.forEach((adj: any) => {
          adjHtml += `<div style="margin-bottom: 4px;"><strong>${escapeHtml(adj.adjective)}</strong>`;
          if (adj.example) adjHtml += `: <em>"${escapeHtml(adj.example)}"</em>`;
          adjHtml += '</div>';
        });
        adjHtml += '</div>';
        content += renderSubsection('Adjetivos descriptivos de la relación', adjHtml);
      }
    }

    // Emotion matrix
    if (figure.figure_emotion_matrix && Object.keys(figure.figure_emotion_matrix).length > 0) {
      let matrixHtml = '<table style="font-size: 9px;"><thead><tr><th>Emoción</th>';
      EMOTION_MATRIX_COLUMNS.forEach(col => { matrixHtml += `<th style="text-align: center; font-size: 8px;">${escapeHtml(col)}</th>`; });
      matrixHtml += '</tr></thead><tbody>';
      EMOTION_MATRIX_EMOTIONS.forEach(emotion => {
        const selected = figure.figure_emotion_matrix[emotion] || [];
        matrixHtml += `<tr><td style="font-weight: 600;">${escapeHtml(emotion)}</td>`;
        EMOTION_MATRIX_COLUMNS.forEach(col => {
          const isChecked = selected.includes(col);
          matrixHtml += `<td style="text-align: center;">${isChecked ? '✓' : ''}</td>`;
        });
        matrixHtml += '</tr>';
      });
      matrixHtml += '</tbody></table>';
      content += renderSubsection('Matriz de Tolerancia Emocional', matrixHtml);
    }

    // Narrative fields
    content += renderConditionalNarrative('Primer recuerdo', figure.figure_first_memory);
    content += renderConditionalNarrative('Expresión típica de su cara', figure.figure_face_expression);

    if (figure.figure_still_in_life) {
      content += renderNarrative('¿Forma parte de tu vida actualmente?', renderBoolean(figure.figure_still_in_life));
      if (figure.figure_still_in_life === 'si') {
        content += renderConditionalNarrative('Relación actual', figure.figure_current_relationship);
      } else {
        content += renderConditionalNarrative('Pérdida/ausencia', figure.figure_loss_reaction);
      }
    }

    content += renderConditionalNarrative('Reacción cuando te sentías mal', figure.figure_when_bad);
    content += renderConditionalNarrative('Reacción ante éxitos/fracasos', figure.figure_success_failure);
    content += renderConditionalNarrative('Ayuda en situaciones importantes', figure.figure_help_important);
    content += renderConditionalNarrative('Palabra más significativa', figure.figure_most_important_word);
    content += renderConditionalNarrative('Emoción que llevaba peor sentir (en sí misma)', figure.figure_worst_emotion_self);
    content += renderConditionalNarrative('Emoción que llevaba peor que sintieras tú', figure.figure_worst_emotion_you);

    if (figure.figure_help_physical) {
      content += renderNarrative('¿Ayudaba cuando estabas físicamente mal?', renderBoolean(figure.figure_help_physical));
      if (figure.figure_help_physical === 'si') {
        content += renderConditionalNarrative('¿De qué modo?', figure.figure_help_physical_how);
      }
    }

    content += renderConditionalNarrative('Apoyo emocional', figure.figure_help_emotional);
    content += renderConditionalNarrative('Comentarios adicionales', figure.figure_more_comments);

    const title = `Figura ${index + 1}: ${escapeHtml(figureName)}${figureRelation ? ` (${escapeHtml(figureRelation)})` : ''}`;
    sections.push(renderSection(title, content));
    sectionCount++;
  });

  // ===== FACTOR SCORES (if any) =====
  if (Object.keys(factorScores).length > 0) {
    const fsRows = Object.entries(factorScores)
      .map(([key, value]) => {
        const label = FACTOR_LABELS[key]?.label || key;
        return `<tr><td><strong>${escapeHtml(key)}</strong> — ${escapeHtml(label)}</td><td class="amount">${typeof value === 'number' ? value.toFixed(2) : value}</td></tr>`;
      }).join('');
    
    if (fsRows) {
      sections.push(renderSection('Factores Calculados', `
        <table><thead><tr><th>Factor</th><th class="amount">Puntuación</th></tr></thead>
        <tbody>${fsRows}</tbody></table>
      `));
      sectionCount++;
    }
  }

  // ===== AI INTERPRETATION =====
  const emoInterpretation = metadata?.emoInterpretation || metadata?.aiInterpretation;
  if (emoInterpretation) {
    let interpContent = '';
    
    if (emoInterpretation.perfil_regulacion) {
      interpContent += renderNarrative('Perfil de regulación', emoInterpretation.perfil_regulacion);
    }
    if (emoInterpretation.calidad_apego) {
      interpContent += renderNarrative('Calidad de apego', emoInterpretation.calidad_apego);
    }
    if (emoInterpretation.recursos_regulacion?.length > 0) {
      interpContent += renderSubsection('Recursos de regulación', renderBadgeList(emoInterpretation.recursos_regulacion, 'badge-green'));
    }
    if (emoInterpretation.areas_intervencion?.length > 0) {
      interpContent += renderSubsection('Áreas de intervención', renderBadgeList(emoInterpretation.areas_intervencion, 'badge-amber'));
    }
    if (emoInterpretation.hipotesis_origen) {
      interpContent += renderNarrative('Hipótesis de origen', emoInterpretation.hipotesis_origen);
    }
    if (emoInterpretation.resumen_clinico) {
      interpContent += renderNarrative('Resumen clínico', emoInterpretation.resumen_clinico);
    }

    if (interpContent) {
      sections.push(`
        <div class="section">
          <h3>🤖 Interpretación Clínica (IA)</h3>
          <div class="ai-interpretation">${interpContent}</div>
        </div>
      `);
      sectionCount++;
    }
  }

  console.log(`[EMO PDF] Rendered ${sectionCount} sections, ${figuresData.length} figures, ${Object.keys(answers).length} answer keys`);

  return sections.join('\n');
}

// =====================================================
// YBOCS2 SPECIFIC RENDERER
// =====================================================

function generateYBOCS2HTML(answers: Record<string, any>, factorScores: Record<string, number>): string {
  // YBOCS2 uses standard items – will be handled by generic renderer
  // Add factor scores display if present
  if (Object.keys(factorScores).length === 0) return '';
  
  const totalObs = factorScores['OBSESIONES'] ?? 0;
  const totalComp = factorScores['COMPULSIONES'] ?? 0;
  const total = factorScores['TOTAL'] ?? (totalObs + totalComp);

  let levelLabel = 'Subclínico';
  let levelColor = '#16a34a';
  if (total >= 24) { levelLabel = 'Grave'; levelColor = '#dc2626'; }
  else if (total >= 16) { levelLabel = 'Moderado'; levelColor = '#d97706'; }
  else if (total >= 8) { levelLabel = 'Leve'; levelColor = '#f59e0b'; }

  return `
    <div class="section">
      <h3>Resultado Y-BOCS II</h3>
      <div class="global-indices" style="grid-template-columns: repeat(3, 1fr);">
        <div class="global-index" style="border-left: 4px solid ${levelColor};">
          <div class="index-value" style="color: ${levelColor};">${total}</div>
          <div class="index-label">Puntuación Total</div>
          <div class="index-desc">${levelLabel}</div>
        </div>
        <div class="global-index">
          <div class="index-value">${totalObs}</div>
          <div class="index-label">Obsesiones</div>
        </div>
        <div class="global-index">
          <div class="index-value">${totalComp}</div>
          <div class="index-label">Compulsiones</div>
        </div>
      </div>
    </div>
  `;
}

// =====================================================
// IMAGE FETCHING
// =====================================================

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const base64 = base64Encode(arrayBuffer);
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assessment_id } = await req.json();

    if (!assessment_id) {
      return new Response(JSON.stringify({ error: "assessment_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log('[PDF] Generating for assessment:', assessment_id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch assessment with all related data
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select(`
        *,
        patients (first_name, last_name, date_of_birth, gender, email),
        profiles:professional_id (first_name, last_name, specialty, collegiate_number),
        assessment_templates:template_id (name, code, flag_threshold, chart_full_mark, items, scoring, instructions),
        assessment_responses (answers, factor_scores, metadata, flags)
      `)
      .eq("id", assessment_id)
      .single();

    if (assessmentError || !assessment) {
      console.error("[PDF] Assessment fetch error:", assessmentError);
      return new Response(JSON.stringify({ error: "Assessment not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch center data
    const { data: center } = await supabase
      .from("centers")
      .select("name, logo_url, address, city, postal_code, phone, email, province")
      .eq("id", assessment.center_id)
      .single();

    const patient = assessment.patients;
    const professional = assessment.profiles;
    const template = assessment.assessment_templates;
    const response = assessment.assessment_responses?.[0] || null;

    const factorScores = (response?.factor_scores || {}) as Record<string, number>;
    const answers = (response?.answers || {}) as Record<string, any>;
    const metadata = (response?.metadata || {}) as any;
    const flags = (response?.flags || {}) as any;
    const templateCode = template.code;

    console.log(`[PDF] Template: ${templateCode}, answer keys: ${Object.keys(answers).length}, factor keys: ${Object.keys(factorScores).length}, has metadata: ${!!metadata && Object.keys(metadata).length > 0}`);

    // Generate logo
    let logoBase64 = '';
    if (center?.logo_url) {
      logoBase64 = await fetchImageAsBase64(center.logo_url) || '';
    }

    // ===== DISPATCH TO SPECIFIC RENDERER =====
    let bodyContent = '';
    const isEMO = templateCode === 'EMO';
    const isSCL90 = templateCode === 'SCL90_V1';
    const isPAI = templateCode === 'PAI_V1';
    const isMMPI2RF = templateCode === 'MMPI2RF';
    const isBDI2 = templateCode === 'BDI2';
    const isDCI = templateCode === 'DCI';
    const isDES = templateCode === 'DES';
    const isSTAI = templateCode === 'STAI';
    const isYBOCS2 = templateCode === 'YBOCS2';
    const flagThreshold = template.flag_threshold || 4;
    const factorOrder = getFactorOrder(templateCode);

    if (isEMO) {
      // EMO: Use specific renderer – skip generic sections entirely
      bodyContent = generateEMOHTML(answers, factorScores, metadata);
    } else {
      // ===== GENERIC + SPECIFIC SECTIONS =====
      const parts: string[] = [];

      // BDI-II
      if (isBDI2 && factorScores['TOTAL'] !== undefined) {
        parts.push(generateBDI2HTML(factorScores, flags));
      }

      // DCI
      if (isDCI && factorScores['DET'] !== undefined) {
        parts.push(generateDCIHTML(factorScores));
      }

      // DES
      if (isDES && factorScores['TOTAL'] !== undefined) {
        parts.push(generateDESHTML(factorScores, metadata, template, answers));
      }

      // STAI
      if (isSTAI) {
        parts.push(generateSTAIHTML(factorScores));
      }

      // YBOCS2
      if (isYBOCS2) {
        parts.push(generateYBOCS2HTML(answers, factorScores));
      }

      // SCL-90 Global Indices
      if (isSCL90) {
        const globalRows = SCL90_GLOBAL_ORDER
          .filter(code => factorScores[code] !== undefined)
          .map(code => {
            const score = factorScores[code];
            const isPST = code === 'PST';
            return `<div class="global-index"><div class="index-value">${isPST ? Math.round(score) : score.toFixed(2)}</div><div class="index-label">${FACTOR_LABELS[code]?.label || code}</div><div class="index-desc">${FACTOR_LABELS[code]?.description || ''}</div></div>`;
          }).join('');
        if (globalRows) {
          parts.push(renderSection('Índices Globales', `<div class="global-indices">${globalRows}</div>`));
        }
      }

      // Generic factor scores table (skip for MMPI2RF which has its own format)
      if (Object.keys(factorScores).length > 0 && !isMMPI2RF && !isBDI2 && !isDCI && !isDES && !isSTAI && !isYBOCS2) {
        const tableHtml = renderFactorScoresTable(factorScores, factorOrder, FACTOR_LABELS, flagThreshold, isSCL90 ? 'Dimensión' : 'Factor');
        if (tableHtml) {
          parts.push(renderSection(`Puntuaciones por ${isSCL90 ? 'Dimensión' : 'Factor'}`, tableHtml));
        }
      }

      // MMPI-2-RF summary
      if (isMMPI2RF && Object.keys(answers).length > 0) {
        parts.push(generateMMPI2RFSummaryHTML(answers));
      }

      // Interpretations
      if (isPAI && metadata?.paiInterpretation) {
        parts.push(generatePAIInterpretationHTML(metadata.paiInterpretation));
      } else if (isMMPI2RF && metadata?.mmpi2rfInterpretation) {
        parts.push(generateMMPI2RFInterpretationHTML(metadata.mmpi2rfInterpretation));
      } else {
        // Generic interpretation for high factors
        const highFactors = factorOrder
          .filter(code => factorScores[code] !== undefined && factorScores[code] > flagThreshold)
          .map(code => ({ code, score: factorScores[code] }))
          .sort((a, b) => b.score - a.score);

        if (highFactors.length > 0 && !isMMPI2RF && !isPAI) {
          const factorCards = highFactors.map(({ code, score }) => {
            const texts = INTERPRETATION_TEXTS[code];
            if (!texts) return '';
            return `<div class="interpretation-card"><h4>${escapeHtml(code)} — ${escapeHtml(FACTOR_LABELS[code]?.label || code)} <span class="score-badge">${score.toFixed(2)}</span></h4><p>${escapeHtml(texts.interpretation)}</p><div class="interventions"><strong>Líneas de intervención sugeridas:</strong><ul>${texts.interventions.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div></div>`;
          }).join('');
          parts.push(renderSection('Interpretación y Sugerencias de Intervención', factorCards));
        }
      }

      // Generic answers detail
      const templateItems = template.items || [];
      if (templateItems.length > 0 && Object.keys(answers).length > 0) {
        if (isMMPI2RF) {
          const answersList = templateItems
            .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
            .map((item: any) => {
              const answer = answers[item.index?.toString()];
              return `<span class="answer-chip">${item.index}: ${answer === 1 ? 'V' : answer === 0 ? 'F' : '—'}</span>`;
            }).join('');
          parts.push(renderSection('Detalle de Respuestas', `<div class="answers-compact">${answersList}</div>`));
        } else {
          const answerRows = templateItems
            .filter((item: any) => item.index !== undefined)
            .sort((a: any, b: any) => a.index - b.index)
            .map((item: any) => {
              const answer = answers[item.index?.toString()];
              return `<div class="answer-row"><span class="answer-index">${item.index}.</span><span class="answer-text">${escapeHtml(item.text || '')}</span><span class="answer-value">${answer !== undefined ? answer : '—'}</span></div>`;
            }).join('');
          if (answerRows) {
            parts.push(`<div class="section answers-section"><h3>Detalle de Respuestas</h3><div class="answers-list">${answerRows}</div></div>`);
          }
        }
      }

      bodyContent = parts.filter(Boolean).join('\n');
    }

    // Validate content
    if (!bodyContent || bodyContent.trim().length < 50) {
      console.warn(`[PDF] WARNING: Generated body content is very short (${bodyContent?.length || 0} chars) for template ${templateCode}`);
    }

    const contentSections = (bodyContent.match(/<div class="section/g) || []).length;
    console.log(`[PDF] Total sections rendered: ${contentSections}`);

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Evaluación - ${escapeHtml(template.name)} - ${escapeHtml(patient.first_name)} ${escapeHtml(patient.last_name)}</title>
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
    
    .section { margin-bottom: 25px; page-break-inside: auto; }
    .section h3 { font-size: 13px; color: #1e293b; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; page-break-after: avoid; }
    
    .subsection { margin-bottom: 12px; }
    .subsection h4 { font-size: 11px; color: #475569; margin-bottom: 6px; page-break-after: avoid; }
    
    .narrative-block { margin-bottom: 10px; page-break-inside: avoid; }
    .narrative-label { font-size: 10px; font-weight: 600; color: #475569; margin-bottom: 3px; }
    .narrative-content { font-size: 10px; color: #334155; background: #f8fafc; padding: 8px 10px; border-radius: 4px; border-left: 2px solid #cbd5e1; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #f1f5f9; padding: 8px 6px; text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
    .amount { text-align: center; }
    
    .level-high { color: #dc2626; font-weight: 600; }
    .level-moderate { color: #d97706; font-weight: 600; }
    .level-low { color: #16a34a; font-weight: 600; }
    
    .alert-badge { background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    .ok-badge { background: #f0fdf4; color: #16a34a; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    
    .badge-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .badge-amber { background: #fffbeb; color: #92400e; border: 1px solid #fbbf24; }
    .badge-red { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
    .badge-green { background: #f0fdf4; color: #166534; border: 1px solid #86efac; }
    
    .global-indices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .global-index { text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; page-break-inside: avoid; }
    .index-value { font-size: 24px; font-weight: bold; color: #6366f1; }
    .index-label { font-size: 10px; font-weight: 600; color: #1e293b; margin-top: 4px; }
    .index-desc { font-size: 8px; color: #64748b; margin-top: 2px; }
    
    .interpretation-card { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 12px; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
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
    .ai-interpretation h4 { font-size: 11px; color: #7c3aed; margin-bottom: 8px; }
    .ai-section { margin-bottom: 12px; page-break-inside: auto; }
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
      body { padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .section { page-break-inside: auto; }
      .section h3 { page-break-after: avoid; }
      .subsection h4 { page-break-after: avoid; }
      .narrative-block { page-break-inside: avoid; }
      .interpretation-card { page-break-inside: avoid; }
      .info-box, .global-index { page-break-inside: avoid; }
      .answers-section { page-break-before: always; }
      .ai-interpretation { page-break-inside: auto; }
      .ai-section { page-break-inside: auto; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }

      @page { margin: 15mm 12mm; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <div class="company-info">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height: 50px; margin-bottom: 6px;" />` : ''}
        <h1>${escapeHtml(center?.name || 'Centro')}</h1>
        ${center?.address ? `<p>${escapeHtml(center.address)}</p>` : ''}
        ${center?.city || center?.postal_code ? `<p>${escapeHtml(center?.postal_code || '')} ${escapeHtml(center?.city || '')}</p>` : ''}
        ${center?.phone ? `<p>Tel: ${escapeHtml(center.phone)}</p>` : ''}
        ${center?.email ? `<p>${escapeHtml(center.email)}</p>` : ''}
      </div>
      <div class="report-info">
        <p class="report-type">Informe de Evaluación Psicológica</p>
        <h2>${escapeHtml(template.name)}</h2>
        <p><strong>Código:</strong> ${escapeHtml(templateCode)}</p>
        ${assessment.completed_at ? `<p><strong>Fecha:</strong> ${formatDate(assessment.completed_at)}</p>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Paciente</h4>
        <p><strong>${escapeHtml(patient.first_name)} ${escapeHtml(patient.last_name)}</strong></p>
        ${patient.date_of_birth ? `<p>Fecha nacimiento: ${formatDate(patient.date_of_birth)}</p>` : ''}
        ${patient.gender ? `<p>Género: ${patient.gender === 'male' ? 'Masculino' : patient.gender === 'female' ? 'Femenino' : escapeHtml(patient.gender)}</p>` : ''}
        ${patient.email ? `<p>${escapeHtml(patient.email)}</p>` : ''}
      </div>
      <div class="info-box">
        <h4>Profesional</h4>
        <p><strong>${escapeHtml(professional?.first_name || '')} ${escapeHtml(professional?.last_name || '')}</strong></p>
        ${professional?.specialty ? `<p>${escapeHtml(professional.specialty)}</p>` : ''}
        ${professional?.collegiate_number ? `<p>Nº Colegiado: ${escapeHtml(professional.collegiate_number)}</p>` : ''}
      </div>
    </div>

    ${bodyContent}

    <div class="footer">
      <p class="confidential">⚠️ DOCUMENTO CONFIDENCIAL - USO PROFESIONAL EXCLUSIVO</p>
      <p>Este informe contiene información clínica protegida. Su distribución no autorizada está prohibida.</p>
      <p style="margin-top: 8px;">Generado por Psycma · Sistema de Gestión Clínica · ${formatDate(new Date().toISOString())}</p>
    </div>
  </div>
</body>
</html>`;

    return new Response(
      JSON.stringify({ html, assessment: { id: assessment.id, patient: `${patient.first_name} ${patient.last_name}`, template: template.name, completed_at: assessment.completed_at } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[PDF] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// =====================================================
// SPECIFIC TEST RENDERERS (BDI2, DCI, DES, STAI, PAI, MMPI2RF)
// =====================================================

function generateBDI2HTML(factorScores: Record<string, number>, flags: any): string {
  const totalScore = factorScores['TOTAL'];
  const cogAffect = factorScores['COG_AFECT'] ?? 0;
  const somVeg = factorScores['SOM_VEG'] ?? 0;
  const item9 = factorScores['ITEM9'] ?? 0;
  const suicideAlert = item9 >= 2 || flags?.['SUICIDIO_alerta'];

  const BDI2_CUTOFFS = [
    { min: 0, max: 13, level: 'Mínima', color: '#16a34a' },
    { min: 14, max: 19, level: 'Leve', color: '#d97706' },
    { min: 20, max: 28, level: 'Moderada', color: '#ea580c' },
    { min: 29, max: 63, level: 'Grave', color: '#dc2626' },
  ];
  const levelInfo = BDI2_CUTOFFS.find(c => totalScore >= c.min && totalScore <= c.max) || BDI2_CUTOFFS[0];

  return `
    <div class="section">
      <h3>Resultado BDI-II</h3>
      ${suicideAlert ? `<div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><p style="color: #dc2626; font-weight: bold; margin-bottom: 6px;">⚠️ ALERTA DE RIESGO SUICIDA</p><p style="font-size: 10px; color: #7f1d1d;">El paciente ha indicado ideación suicida significativa (Ítem 9 = ${item9}). Realizar valoración inmediata.</p></div>` : ''}
      <div class="global-indices" style="grid-template-columns: repeat(2, 1fr);">
        <div class="global-index" style="border-left: 4px solid ${levelInfo.color};"><div class="index-value" style="color: ${levelInfo.color};">${totalScore}</div><div class="index-label">Puntuación Total</div><div class="index-desc">Depresión ${levelInfo.level}</div></div>
        <div class="global-index"><div style="display: flex; justify-content: space-around;"><div><div class="index-value" style="font-size: 18px;">${cogAffect}</div><div class="index-desc">Cognitivo-Afectivo</div></div><div><div class="index-value" style="font-size: 18px;">${somVeg}</div><div class="index-desc">Somático-Vegetativo</div></div></div></div>
      </div>
      <p class="note" style="margin-top: 12px;">Puntos de corte: 0-13 Mínima, 14-19 Leve, 20-28 Moderada, 29-63 Grave</p>
    </div>
  `;
}

function generateDCIHTML(factorScores: Record<string, number>): string {
  const detScore = factorScores['DET'] ?? 0;
  const comScore = factorScores['COM'] ?? 0;
  const valScore = factorScores['VAL'] ?? 0;
  const detClinical = detScore >= 18;
  const comClinical = comScore >= 10;
  const valWarning = valScore >= 10;

  return `
    <div class="section">
      <h3>Resultado DCI</h3>
      ${valWarning ? `<div style="background: #fefce8; border: 2px solid #d97706; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><p style="color: #d97706; font-weight: bold;">⚠️ ADVERTENCIA DE VALIDEZ</p><p style="font-size: 10px; color: #92400e;">Puntuación de validez elevada (${valScore}/14).</p></div>` : ''}
      <div class="global-indices" style="grid-template-columns: repeat(2, 1fr);">
        <div class="global-index" style="border-left: 4px solid ${detClinical ? '#dc2626' : '#16a34a'};"><div class="index-value" style="color: ${detClinical ? '#dc2626' : '#16a34a'};">${detScore}</div><div class="index-label">Distanciamiento</div><div class="index-desc">${detClinical ? 'Nivel clínico (≥18)' : 'Normal (<18)'}</div></div>
        <div class="global-index" style="border-left: 4px solid ${comClinical ? '#dc2626' : '#16a34a'};"><div class="index-value" style="color: ${comClinical ? '#dc2626' : '#16a34a'};">${comScore}</div><div class="index-label">Compartimentación</div><div class="index-desc">${comClinical ? 'Nivel clínico (≥10)' : 'Normal (<10)'}</div></div>
      </div>
      <p class="note" style="margin-top: 12px;">Puntos de corte basados en la adaptación española (Perona-Garcerán et al., 2021)</p>
    </div>
  `;
}

function generateDESHTML(factorScores: Record<string, number>, metadata: any, template: any, answers: Record<string, any>): string {
  const totalScore = factorScores['TOTAL'] ?? 0;
  const amnesiaScore = factorScores['DES_A'] ?? 0;
  const depersonScore = factorScores['DES_D'] ?? 0;
  const absorptionScore = factorScores['DES_I'] ?? 0;
  const taxonScore = factorScores['DES_T'] ?? 0;

  const isClinical = totalScore >= 30;
  const isElevated = totalScore >= 20 && totalScore < 30;
  const isTaxonPositive = taxonScore >= 20;
  const levelColor = isClinical ? '#dc2626' : isElevated ? '#d97706' : '#16a34a';
  const levelLabel = isClinical ? 'Clínico (≥30)' : isElevated ? 'Elevado (≥20)' : 'Normal (<20)';

  const elevatedSubscales: { label: string; score: number }[] = [];
  if (amnesiaScore >= 20) elevatedSubscales.push({ label: 'Amnesia', score: amnesiaScore });
  if (absorptionScore >= 20) elevatedSubscales.push({ label: 'Absorción', score: absorptionScore });
  if (depersonScore >= 20) elevatedSubscales.push({ label: 'Despersonalización', score: depersonScore });

  return `
    <div class="section">
      <h3>Resultado DES - Escala de Experiencias Disociativas</h3>
      ${isTaxonPositive ? `<div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 12px; margin-bottom: 16px;"><p style="color: #dc2626; font-weight: bold;">⚠️ TAXÓN DISOCIATIVO POSITIVO</p><p style="font-size: 10px; color: #7f1d1d;">DES-T ≥ 20 sugiere disociación patológica.</p></div>` : ''}
      <div class="global-indices" style="grid-template-columns: 1fr 1fr;">
        <div class="global-index" style="border-left: 4px solid ${levelColor};"><div class="index-value" style="color: ${levelColor};">${totalScore.toFixed(1)}%</div><div class="index-label">Puntuación Total</div><div class="index-desc">${levelLabel}</div></div>
        <div class="global-index" style="border-left: 4px solid ${isTaxonPositive ? '#dc2626' : '#16a34a'};"><div class="index-value" style="color: ${isTaxonPositive ? '#dc2626' : '#16a34a'};">${taxonScore.toFixed(1)}%</div><div class="index-label">Taxón Disociativo</div><div class="index-desc">${isTaxonPositive ? 'Positivo (≥20)' : 'Negativo (<20)'}</div></div>
      </div>
      <div style="margin-top: 16px;">
        <h4 style="font-size: 12px; margin-bottom: 8px;">Subescalas</h4>
        <table style="width: 100%; font-size: 11px;">
          <tr style="${amnesiaScore >= 20 ? 'background: #fef2f2;' : ''}"><td>Amnesia Disociativa (DES-A)</td><td style="text-align: right; font-weight: bold; ${amnesiaScore >= 20 ? 'color: #dc2626;' : ''}">${amnesiaScore.toFixed(1)}%</td></tr>
          <tr style="${depersonScore >= 20 ? 'background: #fef2f2;' : ''}"><td>Despersonalización/Desrealización (DES-D)</td><td style="text-align: right; font-weight: bold; ${depersonScore >= 20 ? 'color: #dc2626;' : ''}">${depersonScore.toFixed(1)}%</td></tr>
          <tr style="${absorptionScore >= 20 ? 'background: #fef2f2;' : ''}"><td>Absorción/Imaginación (DES-I)</td><td style="text-align: right; font-weight: bold; ${absorptionScore >= 20 ? 'color: #dc2626;' : ''}">${absorptionScore.toFixed(1)}%</td></tr>
        </table>
      </div>
      <p class="note" style="margin-top: 12px;">Puntos de corte: ≥30 Clínico, ≥20 Elevado. DES-T ≥20 indica taxón disociativo.</p>
    </div>
  `;
}

function generateSTAIHTML(factorScores: Record<string, number>): string {
  const aeScore = factorScores['A_E'] ?? 0;
  const arScore = factorScores['A_R'] ?? 0;

  if (aeScore === 0 && arScore === 0) return '';

  return `
    <div class="section">
      <h3>Resultado STAI</h3>
      <div class="global-indices" style="grid-template-columns: repeat(2, 1fr);">
        <div class="global-index"><div class="index-value">${aeScore}</div><div class="index-label">Ansiedad Estado (A/E)</div><div class="index-desc">Estado emocional transitorio (0-60)</div></div>
        <div class="global-index"><div class="index-value">${arScore}</div><div class="index-label">Ansiedad Rasgo (A/R)</div><div class="index-desc">Propensión ansiosa estable (0-60)</div></div>
      </div>
    </div>
  `;
}

function generateMMPI2RFSummaryHTML(answers: Record<string, any>): string {
  const totalItems = Object.keys(answers).length;
  const trueCount = Object.values(answers).filter(v => v === 1).length;
  const falseCount = Object.values(answers).filter(v => v === 0).length;
  const truePercent = ((trueCount / totalItems) * 100).toFixed(1);

  return `
    <div class="section">
      <h3>Resumen de Respuestas MMPI-2-RF</h3>
      <div class="mmpi-summary">
        <div class="summary-item"><div class="summary-value">${totalItems}</div><div class="summary-label">Total ítems</div></div>
        <div class="summary-item"><div class="summary-value">${trueCount}</div><div class="summary-label">Verdadero</div></div>
        <div class="summary-item"><div class="summary-value">${falseCount}</div><div class="summary-label">Falso</div></div>
        <div class="summary-item"><div class="summary-value">${truePercent}%</div><div class="summary-label">Tasa V</div></div>
      </div>
    </div>
  `;
}

function generatePAIInterpretationHTML(interpretation: any): string {
  if (!interpretation) return '';
  const validityClass = interpretation.validez?.estado === 'válido' ? 'validity-valid' : interpretation.validez?.estado === 'cuestionable' ? 'validity-questionable' : 'validity-invalid';
  const getRiskClass = (nivel: string) => { const n = nivel?.toLowerCase(); return n === 'alto' ? 'risk-alto' : n === 'moderado' ? 'risk-moderado' : 'risk-bajo'; };

  return `
    <div class="section">
      <h3>🤖 Interpretación Clínica IA - PAI</h3>
      <div class="ai-interpretation">
        ${interpretation.resumenEjecutivo ? `<div class="ai-section"><h5>Resumen Ejecutivo</h5><p>${escapeHtml(interpretation.resumenEjecutivo)}</p></div>` : ''}
        ${interpretation.validez ? `<div class="ai-section"><h5>Validez del Protocolo</h5><p><strong class="${validityClass}">Estado: ${interpretation.validez.estado?.toUpperCase()}</strong></p><p>${escapeHtml(interpretation.validez.observaciones || '')}</p></div>` : ''}
        ${interpretation.riesgos ? `<div class="ai-section"><h5>Evaluación de Riesgos</h5><p><span class="risk-badge ${getRiskClass(interpretation.riesgos.nivelGlobal)}">Nivel Global: ${interpretation.riesgos.nivelGlobal?.toUpperCase()}</span></p>${interpretation.riesgos.suicidio ? `<p><strong>Suicidio (${interpretation.riesgos.suicidio.nivel}):</strong> ${escapeHtml(interpretation.riesgos.suicidio.observaciones)}</p>` : ''}${interpretation.riesgos.violencia ? `<p><strong>Violencia (${interpretation.riesgos.violencia.nivel}):</strong> ${escapeHtml(interpretation.riesgos.violencia.observaciones)}</p>` : ''}${interpretation.riesgos.descompensacion ? `<p><strong>Descompensación (${interpretation.riesgos.descompensacion.nivel}):</strong> ${escapeHtml(interpretation.riesgos.descompensacion.observaciones)}</p>` : ''}</div>` : ''}
        ${interpretation.perfilClinico?.escalasElevadas?.length > 0 ? `<div class="ai-section"><h5>Escalas Elevadas</h5><ul>${interpretation.perfilClinico.escalasElevadas.map((e: any) => `<li><strong>${escapeHtml(e.escala)} (T=${e.puntuacionT}):</strong> ${escapeHtml(e.interpretacion)}</li>`).join('')}</ul></div>` : ''}
        ${interpretation.perfilClinico?.formulacionIntegrada ? `<div class="ai-section"><h5>Formulación Integrada</h5><p>${escapeHtml(interpretation.perfilClinico.formulacionIntegrada)}</p></div>` : ''}
        ${interpretation.hipotesisDiagnosticas?.length > 0 ? `<div class="ai-section"><h5>Hipótesis Diagnósticas</h5><ul>${interpretation.hipotesisDiagnosticas.map((h: string) => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>` : ''}
        ${interpretation.intervenciones ? `<div class="ai-section"><h5>Recomendaciones de Intervención</h5>${interpretation.intervenciones.prioridades?.length > 0 ? `<p><strong>Prioridades:</strong></p><ul>${interpretation.intervenciones.prioridades.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}${interpretation.intervenciones.enfoqueSugerido ? `<p><strong>Enfoque sugerido:</strong> ${escapeHtml(interpretation.intervenciones.enfoqueSugerido)}</p>` : ''}${interpretation.intervenciones.precauciones?.length > 0 ? `<p><strong>Precauciones:</strong></p><ul>${interpretation.intervenciones.precauciones.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      </div>
    </div>
  `;
}

function generateMMPI2RFInterpretationHTML(interpretation: any): string {
  if (!interpretation) return '';
  const validityClass = interpretation.validez?.estado === 'válido' ? 'validity-valid' : interpretation.validez?.estado === 'cuestionable' ? 'validity-questionable' : 'validity-invalid';
  const getRiskClass = (nivel: string) => { const n = nivel?.toLowerCase(); return n === 'alto' ? 'risk-alto' : n === 'moderado' ? 'risk-moderado' : 'risk-bajo'; };

  return `
    <div class="section">
      <h3>🤖 Interpretación Clínica IA - MMPI-2-RF</h3>
      <div class="ai-interpretation">
        ${interpretation.resumenEjecutivo ? `<div class="ai-section"><h5>Resumen Ejecutivo</h5><p>${escapeHtml(interpretation.resumenEjecutivo)}</p></div>` : ''}
        ${interpretation.validez ? `<div class="ai-section"><h5>Validez del Protocolo</h5><p><strong class="${validityClass}">Estado: ${interpretation.validez.estado?.toUpperCase()}</strong></p><p>${escapeHtml(interpretation.validez.observaciones || '')}</p>${interpretation.validez.escalasProblematicas?.length > 0 ? `<p><strong>Escalas problemáticas:</strong> ${interpretation.validez.escalasProblematicas.join(', ')}</p>` : ''}</div>` : ''}
        ${interpretation.riesgos ? `<div class="ai-section"><h5>Evaluación de Riesgos</h5><p><span class="risk-badge ${getRiskClass(interpretation.riesgos.nivelGlobal)}">Nivel Global: ${interpretation.riesgos.nivelGlobal?.toUpperCase()}</span></p>${interpretation.riesgos.suicidio ? `<p><strong>Suicidio (${interpretation.riesgos.suicidio.nivel}):</strong> ${escapeHtml(interpretation.riesgos.suicidio.observaciones)}</p>` : ''}${interpretation.riesgos.violencia ? `<p><strong>Violencia (${interpretation.riesgos.violencia.nivel}):</strong> ${escapeHtml(interpretation.riesgos.violencia.observaciones)}</p>` : ''}${interpretation.riesgos.descompensacion ? `<p><strong>Descompensación (${interpretation.riesgos.descompensacion.nivel}):</strong> ${escapeHtml(interpretation.riesgos.descompensacion.observaciones)}</p>` : ''}</div>` : ''}
        ${interpretation.perfilClinico?.escalasElevadas?.length > 0 ? `<div class="ai-section"><h5>Escalas Elevadas</h5><ul>${interpretation.perfilClinico.escalasElevadas.map((e: any) => `<li><strong>${escapeHtml(e.escala)} (T=${e.puntuacionT}):</strong> ${escapeHtml(e.interpretacion)}</li>`).join('')}</ul></div>` : ''}
        ${interpretation.perfilClinico?.formulacionIntegrada ? `<div class="ai-section"><h5>Formulación Integrada</h5><p>${escapeHtml(interpretation.perfilClinico.formulacionIntegrada)}</p></div>` : ''}
        ${interpretation.hipotesisDiagnosticas?.length > 0 ? `<div class="ai-section"><h5>Hipótesis Diagnósticas</h5><ul>${interpretation.hipotesisDiagnosticas.map((h: string) => `<li>${escapeHtml(h)}</li>`).join('')}</ul></div>` : ''}
        ${interpretation.intervenciones ? `<div class="ai-section"><h5>Recomendaciones de Intervención</h5>${interpretation.intervenciones.prioridades?.length > 0 ? `<p><strong>Prioridades:</strong></p><ul>${interpretation.intervenciones.prioridades.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}${interpretation.intervenciones.enfoqueSugerido ? `<p><strong>Enfoque sugerido:</strong> ${escapeHtml(interpretation.intervenciones.enfoqueSugerido)}</p>` : ''}${interpretation.intervenciones.precauciones?.length > 0 ? `<p><strong>Precauciones:</strong></p><ul>${interpretation.intervenciones.precauciones.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      </div>
    </div>
  `;
}

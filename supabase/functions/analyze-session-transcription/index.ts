import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";
import { hasAuthenticatedJWT, unauthorizedResponse } from "../_shared/authGuard.ts";
import { checkPatientConsent, type ConsentCheckResult, type ConsentPurpose } from "../_shared/consent.ts";
import { buildTranscriptFromTurns, type DiarizedTurn } from "../_shared/transcriptDiarization.ts";
import {
  buildJsonFormatInstruction,
  parseModelJson,
  parseSections,
  renderMarkdown,
  validateSections,
  type AiDocumentSection,
} from "../_shared/aiDocuments.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Fallback system prompt ─────────────────────────────────────────────────
// Used when the center has no `ai_prompt_system` set. Per-template user prompts no longer
// have a code-level fallback: when no published `ai_prompt_versions` row resolves for a
// document type (§4 rule 4), the fallback is `ai_document_types.default_user_prompt` —
// the seed prompt stored on the template itself — not a hardcoded map here.
const DEFAULT_SYSTEM_PROMPT = `Actúas como psicólogo clínico especializado en psicoterapia integradora.

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

// ─── Provider errors ───────────────────────────────────────────────────────────
// Distinguishes transport-level failures (network drop, timeout, 5xx) — which are worth one
// automatic retry — from provider-side rejections (bad request, auth, quota) that a retry
// cannot fix.
class ProviderError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
  }
}

// A message meant to reach the client as-is (already in correct Spanish), as opposed to an
// unexpected internal error that should be masked behind a generic message.
class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'UserFacingError';
    this.status = status;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Model name sanitization ────────────────────────────────────────────────
// The model name ends up interpolated directly into the Gemini URL
// (`/v1beta/models/${model}:generateContent`) in `callAIOnce`. A value containing `/`, `..`,
// `?` or whitespace could redirect the request to a different API path. This guards EVERY
// model name that originates outside this file's own code — the request's `model` override,
// `ai_prompt_versions.model` (set by a professional/admin from a template's editor) and the
// center's configured model (set from Ajustes → Inteligencia Artificial, which also offers a
// free-text "Modelo personalizado..." field) — not just the request field.
const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

function sanitizeModelName(raw: string, source: string): string {
  const trimmed = raw.trim();
  if (!MODEL_NAME_PATTERN.test(trimmed)) {
    throw new UserFacingError(
      `El modelo de IA ${source} no es válido: "${raw}". Solo se permiten letras, números, puntos, guiones bajos, dos puntos y guiones (máximo 64 caracteres).`,
      400
    );
  }
  return trimmed;
}

// ─── AI Router ───────────────────────────────────────────────────────────────
const PROVIDER_TIMEOUT_MS = 120_000;

async function callAIOnce(
  systemPrompt: string,
  userPrompt: string,
  provider: string,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    if (provider === 'gemini') {
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
              },
            }),
            signal: controller.signal,
          }
        );
      } catch (fetchErr) {
        throw new ProviderError(`Error de red al contactar con Gemini: ${(fetchErr as Error).message}`, true);
      }
      const data = await response.json();
      if (!response.ok) {
        throw new ProviderError(data.error?.message || `Gemini API error: ${response.status}`, response.status >= 500);
      }
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Default: OpenAI-compatible
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          temperature,
          // `max_tokens` está en desuso en la API de chat completions de OpenAI: los modelos
          // de razonamiento (o1/o3/GPT-5...) lo rechazan de plano, y `max_completion_tokens`
          // ya es compatible con el resto de modelos de chat, así que no hace falta ramificar
          // por modelo.
          max_completion_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      throw new ProviderError(`Error de red al contactar con OpenAI: ${(fetchErr as Error).message}`, true);
    }
    const data = await response.json();
    if (!response.ok) {
      throw new ProviderError(data.error?.message || `OpenAI API error: ${response.status}`, response.status >= 500);
    }
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

/** One retry on network failure / timeout / 5xx, with a 1s backoff. */
async function callAIWithRetry(
  systemPrompt: string,
  userPrompt: string,
  provider: string,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  try {
    return await callAIOnce(systemPrompt, userPrompt, provider, model, apiKey, temperature, maxTokens, jsonMode);
  } catch (error) {
    if (error instanceof ProviderError && error.retryable) {
      console.warn(`[analyze] Error transitorio del proveedor, reintentando una vez: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await callAIOnce(systemPrompt, userPrompt, provider, model, apiKey, temperature, maxTokens, jsonMode);
    }
    throw error;
  }
}

/**
 * Llama al proveedor pidiendo JSON, valida que todas las secciones `required` lleguen con
 * contenido y, si falla, hace UN reintento con una instrucción de corrección explícita
 * (§6.8 / §7). Si el segundo intento también falla, lanza un error claro en español.
 */
async function generateSectionsFromModel(
  systemPrompt: string,
  basePrompt: string,
  sections: AiDocumentSection[],
  provider: string,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<Record<string, string>> {
  const formatInstruction = buildJsonFormatInstruction(sections);
  const fullPrompt = `${basePrompt}\n\n${formatInstruction}`;

  let raw: string;
  try {
    raw = await callAIWithRetry(systemPrompt, fullPrompt, provider, model, apiKey, temperature, maxTokens, true);
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : (error as Error).message;
    throw new UserFacingError(`No se pudo generar el documento: error al conectar con el proveedor de IA (${message}).`);
  }

  let parsed = parseModelJson(raw);
  let missing = validateSections(sections, parsed);

  if (missing.length > 0) {
    console.warn(`[analyze] Respuesta del modelo incompleta (faltan: ${missing.join(', ')}), reintentando con instrucción de corrección`);
    const correctionPrompt = `${fullPrompt}\n\nTu respuesta anterior no era un JSON válido o dejaba vacías estas claves obligatorias: ${missing.join(', ')}. Devuelve de nuevo el objeto JSON COMPLETO, exclusivamente el JSON, con todas las claves obligatorias rellenas con contenido real y no vacío.`;

    let retryRaw: string;
    try {
      retryRaw = await callAIWithRetry(systemPrompt, correctionPrompt, provider, model, apiKey, temperature, maxTokens, true);
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : (error as Error).message;
      throw new UserFacingError(`No se pudo generar el documento: error al conectar con el proveedor de IA (${message}).`);
    }
    parsed = parseModelJson(retryRaw);
    missing = validateSections(sections, parsed);

    if (missing.length > 0) {
      throw new UserFacingError(
        `El modelo de IA no devolvió un documento válido: faltan las secciones obligatorias "${missing.join('", "')}" tras reintentar. Prueba de nuevo o revisa el prompt de la plantilla en Ajustes → Inteligencia Artificial.`
      );
    }
  }

  return parsed;
}

// ─── Document type catalog access ─────────────────────────────────────────────

interface DocumentTypeRow {
  id: string;
  center_id: string | null;
  professional_id: string | null;
  key: string;
  label: string;
  scope: 'session' | 'multi_session' | 'patient' | string;
  requires: string[];
  sections: unknown;
  required_consent_purposes: string[];
  mirror_column: 'ai_summary_clinical' | 'ai_summary_patient' | null;
  is_active: boolean;
  /** Prompt semilla de la plantilla. Red de seguridad cuando no hay ninguna versión publicada
   *  aplicable en `ai_prompt_versions` (§4 regla 4 del contrato). */
  default_user_prompt: string | null;
}

/**
 * Resuelve la plantilla por `key`, de más a menos específica (CONTRACT-2 §1.1):
 * 1. La propia del profesional que genera (`center_id` del centro Y `professional_id` suyo).
 * 2. La del centro (`center_id` del centro, `professional_id IS NULL`).
 * 3. La de sistema (`center_id IS NULL`, `professional_id IS NULL`).
 *
 * `professionalId` puede ser null (llamada de service_role sin usuario, p. ej. el test de
 * conexión) — en ese caso simplemente no hay nivel 1 y se salta a la del centro o sistema.
 * No hace falta filtrar en la query las plantillas propias de OTROS profesionales del mismo
 * centro: esta función corre siempre con el cliente de service role, y esas filas nunca se
 * devuelven como resultado — solo se usan para elegir, en memoria, la fila correcta.
 */
async function loadDocumentType(
  supabase: SupabaseClient,
  key: string,
  centerId: string,
  professionalId: string | null,
): Promise<DocumentTypeRow | null> {
  const { data, error } = await supabase
    .from('ai_document_types')
    .select('id, center_id, professional_id, key, label, scope, requires, sections, required_consent_purposes, mirror_column, is_active, default_user_prompt')
    .eq('key', key)
    .eq('is_active', true)
    .or(`center_id.eq.${centerId},center_id.is.null`);

  if (error || !data || data.length === 0) return null;

  const rows = data as unknown as DocumentTypeRow[];
  return (
    (professionalId
      ? rows.find((row) => row.center_id === centerId && row.professional_id === professionalId)
      : undefined) ??
    rows.find((row) => row.center_id === centerId && row.professional_id === null) ??
    rows.find((row) => row.center_id === null && row.professional_id === null) ??
    null
  );
}

interface PromptVersionRow {
  id: string;
  system_prompt: string | null;
  user_prompt: string;
  model: string | null;
  temperature: number | null;
  professional_id: string | null;
  session_type_id: string | null;
  version: number;
}

/**
 * Resuelve la versión de prompt publicada aplicable según la precedencia del §4:
 * 1. session_type_id de la sesión (con professional_id NULL o el del usuario, el específico gana)
 * 2. professional_id del usuario, sin session_type_id
 * 3. comodín del centro (ambos NULL)
 * Las reglas 4 y 5 (semilla de sistema / constante de código) se resuelven fuera de esta
 * función, en el llamador, porque dependen de si el `documentTypeKey` tiene un prompt de
 * respaldo embebido en el código.
 */
async function resolvePromptVersion(
  supabase: SupabaseClient,
  documentTypeId: string,
  centerId: string,
  professionalId: string | null,
  sessionTypeId: string | null,
): Promise<PromptVersionRow | null> {
  const { data, error } = await supabase
    .from('ai_prompt_versions')
    .select('id, system_prompt, user_prompt, model, temperature, professional_id, session_type_id, version')
    .eq('document_type_id', documentTypeId)
    .eq('center_id', centerId)
    .eq('is_published', true);

  if (error || !data || data.length === 0) return null;

  let best: { row: PromptVersionRow; tier: number; subtier: number } | null = null;

  for (const row of data as unknown as PromptVersionRow[]) {
    let tier: number | null = null;
    let subtier = 1;

    if (sessionTypeId && row.session_type_id === sessionTypeId) {
      if (row.professional_id === professionalId && professionalId) {
        tier = 1; subtier = 0;
      } else if (row.professional_id === null) {
        tier = 1; subtier = 1;
      }
    }
    if (tier === null && professionalId && row.professional_id === professionalId && row.session_type_id === null) {
      tier = 2; subtier = 0;
    }
    if (tier === null && row.professional_id === null && row.session_type_id === null) {
      tier = 3; subtier = 0;
    }
    if (tier === null) continue;

    if (
      !best ||
      tier < best.tier ||
      (tier === best.tier && subtier < best.subtier) ||
      (tier === best.tier && subtier === best.subtier && row.version > best.row.version)
    ) {
      best = { row, tier, subtier };
    }
  }

  return best?.row ?? null;
}

interface ExistingDocumentRow {
  id: string;
  content_sections: Record<string, string> | null;
  content_markdown: string;
  edited_sections: Record<string, string> | null;
  edited_markdown: string | null;
  prompt_version_id: string | null;
  model_used: string | null;
}

/** Documento ya generado reutilizable para esta sesión (o para el paciente, si no hay sesión). */
async function findExistingGeneratedDocument(
  supabase: SupabaseClient,
  documentTypeId: string,
  sessionId: string | null,
  patientId: string,
): Promise<ExistingDocumentRow | null> {
  let query = supabase
    .from('ai_generated_documents')
    .select('id, content_sections, content_markdown, edited_sections, edited_markdown, prompt_version_id, model_used')
    .eq('document_type_id', documentTypeId)
    .order('generated_at', { ascending: false })
    .limit(1);

  query = sessionId ? query.eq('session_id', sessionId) : query.eq('patient_id', patientId).is('session_id', null);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as unknown as ExistingDocumentRow;
}

interface PriorDocumentRow {
  session_id: string | null;
  content_markdown: string;
  edited_markdown: string | null;
  generated_at: string;
}

/** Documentos previos del paciente para plantillas `multi_session`, en orden cronológico. */
async function loadPatientPriorDocuments(
  supabase: SupabaseClient,
  centerId: string,
  patientId: string,
  sourceSessionIds: string[] | null,
): Promise<PriorDocumentRow[]> {
  let query = supabase
    .from('ai_generated_documents')
    .select('session_id, content_markdown, edited_markdown, generated_at')
    .eq('center_id', centerId)
    .eq('patient_id', patientId)
    .order('generated_at', { ascending: false });

  query = sourceSessionIds && sourceSessionIds.length > 0
    ? query.in('session_id', sourceSessionIds)
    : query.limit(10);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as PriorDocumentRow[]).slice().reverse();
}

// ─── Recursive resolution of `requires` ───────────────────────────────────────

interface CenterAiConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  systemPrompt: string;
}

/**
 * Loads the center's AI provider configuration and decrypts its API key.
 * Throws UserFacingError (400) when the center has no key for the selected provider,
 * so both the generation flow and the connection test report the same message.
 */
async function loadCenterAiConfig(
  supabaseService: SupabaseClient,
  centerId: string,
): Promise<CenterAiConfig> {
  let provider = 'openai';
  let model = 'gpt-4.1';
  let apiKey = '';
  let temperature = 0.3;
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;

  const { data: center } = await supabaseService
    .from('centers')
    .select(`
      ai_provider, openai_model, gemini_model,
      openai_api_key_encrypted, gemini_api_key_encrypted,
      ai_prompt_system, ai_temperature
    `)
    .eq('id', centerId)
    .single();

  if (center) {
    provider = (center.ai_provider || 'openai').toString().trim().toLowerCase();
    temperature = center.ai_temperature ?? 0.3;

    if (provider === 'gemini') {
      model = sanitizeModelName(center.gemini_model || 'gemini-2.5-pro', 'configurado en el centro (Gemini)');
      if (!center.gemini_api_key_encrypted) {
        throw new UserFacingError('API key de Gemini no configurada. Ve a Ajustes → Inteligencia Artificial.', 400);
      }
      apiKey = (await decryptSecret(center.gemini_api_key_encrypted)).replace(/[^\x20-\x7E]/g, '').trim();
    } else {
      model = sanitizeModelName(center.openai_model || 'gpt-4.1', 'configurado en el centro (OpenAI)');
      if (!center.openai_api_key_encrypted) {
        throw new UserFacingError('API key de OpenAI no configurada. Ve a Ajustes → Inteligencia Artificial.', 400);
      }
      apiKey = (await decryptSecret(center.openai_api_key_encrypted)).replace(/[^\x20-\x7E]/g, '').trim();
    }

    if (center.ai_prompt_system) systemPrompt = center.ai_prompt_system;
  }

  if (!apiKey) {
    throw new UserFacingError('API key no configurada. Ve a Ajustes → Inteligencia Artificial.', 400);
  }

  return { provider, model, apiKey, temperature, systemPrompt };
}

interface GenerationContext {
  supabaseService: SupabaseClient;
  req: Request;
  centerId: string;
  professionalId: string | null;
  regenerate: boolean;
  aiConfig: CenterAiConfig;
  /** `model` del request (§2.2 de CONTRACT-2), ya saneado. Se aplica a la generación pedida
   *  explícitamente y, cuando se ha pedido `regenerate`, también a las dependencias en
   *  cascada; sin regenerar, esas mantienen su propia resolución (versión de prompt → centro)
   *  para no contaminar con un modelo puntual una extracción base que otros reutilizan. */
  requestModel: string | null;
  // Session-scoped generation
  sessionId: string | null;
  sessionTypeId: string | null;
  effectiveTranscription: string | null;
  transcriptSource: string;
  plaudRecordingId: string | null;
  // Multi-session / patient-scoped generation
  patientId: string;
  sourceSessionIds: string[] | null;
  inputs: Record<string, unknown> | null;
  // Per-request bookkeeping for the `requires` graph
  visiting: Set<string>;
  cache: Map<string, GeneratedResult>;
}

interface GeneratedResult {
  documentId: string;
  documentTypeKey: string;
  sections: Record<string, string>;
  markdown: string;
  promptVersionId: string | null;
  modelUsed: string | null;
  reused: boolean;
}

const MAX_DEPENDENCY_DEPTH = 3;

async function generateSingleDocument(
  dt: DocumentTypeRow,
  depResults: GeneratedResult[],
  ctx: GenerationContext,
  depth: number,
): Promise<GeneratedResult> {
  const sections = parseSections(dt.sections);
  if (sections.length === 0) {
    throw new UserFacingError(`La plantilla "${dt.label}" no tiene secciones configuradas.`, 400);
  }

  const promptVersion = await resolvePromptVersion(ctx.supabaseService, dt.id, ctx.centerId, ctx.professionalId, ctx.sessionTypeId);
  let userPromptBase = promptVersion?.user_prompt;

  if (!userPromptBase && dt.default_user_prompt) {
    // §4 regla 4: sin ninguna versión publicada aplicable, se cae al prompt semilla de la
    // propia plantilla. Esto no debería ocurrir en un centro sembrado normalmente (el
    // trigger de centros nuevos y el backfill de la migración crean siempre una versión 1
    // publicada), así que si llegamos aquí es que al centro le faltan versiones — anomalía
    // digna de investigar, aunque el documento pueda generarse igualmente.
    console.warn(`[analyze] Sin versión de prompt publicada para "${dt.key}" en el centro ${ctx.centerId}; usando default_user_prompt de la plantilla como respaldo. Esto es una anomalía: revisa que el centro tenga versiones sembradas.`);
    userPromptBase = dt.default_user_prompt;
  }

  if (!userPromptBase) {
    throw new UserFacingError(
      `No hay ninguna versión de prompt publicada para la plantilla "${dt.label}" en este centro. Publica una en Ajustes → Inteligencia Artificial.`,
      400
    );
  }

  const systemPrompt = promptVersion?.system_prompt || ctx.aiConfig.systemPrompt;

  // ─── Precedencia del modelo (CONTRACT-2 §2.2) ───────────────────────────────
  // 1. `model` del request.
  // 2. `model` de la versión de prompt resuelta.
  // 3. Modelo del centro (ya saneado en `loadCenterAiConfig`).
  // `promptVersion.model` lo escribe un profesional/admin desde el editor de la plantilla, así
  // que se sanea igual que el del centro y el del request antes de poder usarse.
  //
  // El override del request alcanza a las dependencias en cascada solo cuando se ha pedido
  // `regenerate`. El motivo: sin regenerar, una dependencia como `base_extraction` se reutiliza
  // entre documentos, y generarla con un modelo elegido para UN documento concreto se la
  // colaría a todos los demás sin que nadie lo pidiera. Pero cuando el profesional fuerza la
  // regeneración eligiendo un modelo, espera que todo el árbol se rehaga con ese modelo: si la
  // extracción base que alimenta el informe se quedara con el modelo anterior, elegir un modelo
  // mejor no cambiaría la mitad del resultado.
  const promptVersionModel = promptVersion?.model
    ? sanitizeModelName(promptVersion.model, `configurado en la versión de prompt de la plantilla "${dt.label}"`)
    : null;
  const requestModelOverride = depth === 0 || ctx.regenerate ? ctx.requestModel : null;
  const model = requestModelOverride || promptVersionModel || ctx.aiConfig.model;

  const temperature = promptVersion?.temperature ?? ctx.aiConfig.temperature;
  // En modelos de razonamiento (o1/o3/GPT-5...) los tokens de "pensamiento" interno consumen
  // el mismo presupuesto que max_completion_tokens antes de llegar a la respuesta visible.
  // Los límites anteriores (6000/4000) estaban ajustados para modelos sin razonamiento y se
  // quedaban sin margen para el JSON real con transcripciones largas, devolviendo secciones
  // obligatorias vacías. Se amplía con margen suficiente para ambos tipos de modelo.
  const maxTokens = dt.key === 'base_extraction' ? 24000 : 16000;

  const promptParts: string[] = [userPromptBase];

  for (const dep of depResults) {
    promptParts.push(`--- DOCUMENTO DE APOYO (${dep.documentTypeKey}) ---\n\n${dep.markdown}`);
  }

  if (dt.scope === 'multi_session') {
    const priorDocs = await loadPatientPriorDocuments(ctx.supabaseService, ctx.centerId, ctx.patientId, ctx.sourceSessionIds);
    if (priorDocs.length === 0) {
      throw new UserFacingError('No hay documentos previos del contacto a partir de los cuales generar este informe.', 400);
    }
    const docsBlock = priorDocs
      .map((doc) => {
        const label = `Documento del ${new Date(doc.generated_at).toLocaleDateString('es-ES')}`;
        return `### ${label}\n\n${doc.edited_markdown || doc.content_markdown}`;
      })
      .join('\n\n---\n\n');
    promptParts.push(`DOCUMENTOS PREVIOS DEL CONTACTO:\n\n${docsBlock}`);
  } else {
    if (!ctx.effectiveTranscription) {
      throw new UserFacingError('Se requiere la transcripción de la sesión para generar este documento.', 400);
    }
    promptParts.push(`TRANSCRIPCIÓN DE LA SESIÓN:\n\n${ctx.effectiveTranscription}`);
  }

  if (ctx.inputs && Object.keys(ctx.inputs).length > 0) {
    promptParts.push(`INFORMACIÓN ADICIONAL PROPORCIONADA:\n\n${JSON.stringify(ctx.inputs, null, 2)}`);
  }

  const basePrompt = promptParts.join('\n\n');

  console.log(`[analyze] Generando "${dt.key}" | Provider: ${ctx.aiConfig.provider} | Model: ${model} | Deps: ${depResults.map((d) => d.documentTypeKey).join(', ') || 'ninguna'}`);

  const sectionsContent = await generateSectionsFromModel(
    systemPrompt, basePrompt, sections, ctx.aiConfig.provider, model, ctx.aiConfig.apiKey, temperature, maxTokens
  );
  const markdown = renderMarkdown(sections, sectionsContent);

  const isMultiSession = dt.scope === 'multi_session';
  const sourceSessionIdsToStore = isMultiSession
    ? (ctx.sourceSessionIds ?? [])
    : (ctx.sessionId ? [ctx.sessionId] : []);

  const { data: inserted, error: insertError } = await ctx.supabaseService
    .from('ai_generated_documents')
    .insert({
      center_id: ctx.centerId,
      session_id: isMultiSession ? null : ctx.sessionId,
      patient_id: ctx.patientId,
      document_type_id: dt.id,
      prompt_version_id: promptVersion?.id ?? null,
      source_session_ids: sourceSessionIdsToStore,
      content_sections: sectionsContent,
      content_markdown: markdown,
      transcript_source: isMultiSession ? null : ctx.transcriptSource,
      plaud_recording_id: isMultiSession ? null : ctx.plaudRecordingId,
      model_used: model,
      generated_by: ctx.professionalId,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[analyze] Error al guardar el documento generado:', insertError);
    throw new UserFacingError('No se pudo guardar el documento generado. Inténtalo de nuevo.');
  }

  // ─── Mirror write ────────────────────────────────────────────────────────
  // Only when the template declares a mirror column AND we have a real session to attach it
  // to. NEVER writes to sessions.notes — that column is for the therapist's own free-text
  // notes and a previous version of this function used to clobber it, which was a bug.
  if (dt.mirror_column && ctx.sessionId) {
    const { error: mirrorError } = await ctx.supabaseService
      .from('sessions')
      .update({ [dt.mirror_column]: markdown, transcript_processed_at: new Date().toISOString() })
      .eq('id', ctx.sessionId);
    if (mirrorError) {
      console.error(`[analyze] Error al espejar en sessions.${dt.mirror_column}:`, mirrorError);
    }
  }

  return {
    documentId: inserted.id as string,
    documentTypeKey: dt.key,
    sections: sectionsContent,
    markdown,
    promptVersionId: promptVersion?.id ?? null,
    modelUsed: model,
    reused: false,
  };
}

/**
 * Resuelve (generando si hace falta) el documento de tipo `key`, incluyendo recursivamente
 * sus `requires`. Reutiliza documentos ya generados para la sesión/paciente salvo que
 * `ctx.regenerate` sea true — pero SOLO para dependencias (`depth > 0`): el documento
 * pedido explícitamente en el request (`depth === 0`) se genera siempre de nuevo, porque
 * llamar a esta función ya es, en sí, una petición explícita de generación.
 *
 * Profundidad máxima 3 y detección de ciclos: `visiting` contiene las keys que están
 * actualmente en construcción en la rama actual de la recursión. Si `key` ya está en
 * `visiting`, hay un ciclo en la configuración de `requires` — se lanza un error claro en
 * vez de recursar indefinidamente. El límite de profundidad es una segunda red de
 * seguridad independiente, por si un ciclo lograra no pasar por `visiting` (p. ej. un bug
 * futuro en esta función).
 */
async function resolveDocument(key: string, depth: number, ctx: GenerationContext): Promise<GeneratedResult> {
  const cached = ctx.cache.get(key);
  if (cached) return cached;

  if (ctx.visiting.has(key)) {
    throw new UserFacingError(
      `Se ha detectado un ciclo de dependencias entre plantillas de documento (la plantilla "${key}" depende, directa o indirectamente, de sí misma). Revisa el campo "requires" de las plantillas en Ajustes → Inteligencia Artificial.`
    );
  }
  if (depth > MAX_DEPENDENCY_DEPTH) {
    throw new UserFacingError(
      `Se ha superado la profundidad máxima de dependencias (${MAX_DEPENDENCY_DEPTH}) al resolver la plantilla "${key}".`
    );
  }

  ctx.visiting.add(key);
  try {
    const dt = await loadDocumentType(ctx.supabaseService, key, ctx.centerId, ctx.professionalId);
    if (!dt) {
      throw new UserFacingError(`La plantilla de documento requerida "${key}" no existe o está desactivada.`, 400);
    }

    if (depth > 0 && !ctx.regenerate) {
      const existing = await findExistingGeneratedDocument(ctx.supabaseService, dt.id, ctx.sessionId, ctx.patientId);
      if (existing) {
        const result: GeneratedResult = {
          documentId: existing.id,
          documentTypeKey: key,
          sections: existing.edited_sections ?? existing.content_sections ?? {},
          markdown: existing.edited_markdown ?? existing.content_markdown,
          promptVersionId: existing.prompt_version_id,
          modelUsed: existing.model_used,
          reused: true,
        };
        ctx.cache.set(key, result);
        return result;
      }
    }

    const depResults: GeneratedResult[] = [];
    for (const depKey of dt.requires ?? []) {
      depResults.push(await resolveDocument(depKey, depth + 1, ctx));
    }

    const result = await generateSingleDocument(dt, depResults, ctx, depth);
    ctx.cache.set(key, result);
    return result;
  } finally {
    ctx.visiting.delete(key);
  }
}

// ─── Plaud saved-transcript fallback ───────────────────────────────────────────
// `plaud_recordings.transcript_text` is written by `sync-plaud-recordings/index.ts`
// (`buildTranscriptText`, line ~276 of that file) as one line per segment in the
// literal format `[${speaker ?? "desconocido"}] ${content}`, sorted by startTime,
// joined by "\n" — using the RAW speaker label Plaud returned (e.g. "Speaker 1", or
// occasionally a real name — see the warning in `transcriptDiarization.ts`). It is
// NOT anonymized at write time. That means it must be run through
// `buildTranscriptFromTurns` here, exactly like the `segments` path from the client,
// before it can be used as a prompt input — never pass `transcript_text` straight
// through. Skipping this step would let a real name Plaud captured reach the model;
// running it twice is not a risk here because `buildTranscriptFromTurns` only ever
// runs once, on the reconstructed turns, in this single code path.
//
// This parser reverses `buildTranscriptText`'s exact format to recover `speaker` /
// `content` pairs. "desconocido" (the literal fallback used for `speaker: null`) is
// mapped back to `null` so it becomes `UNLABELED_SPEAKER` in `buildTranscriptFromTurns`
// instead of being anonymized into its own fake "Hablante N".
function parseStoredPlaudTranscript(text: string): DiarizedTurn[] {
  const turns: DiarizedTurn[] = [];
  for (const line of text.split('\n')) {
    const match = /^\[([^\]]*)\] ([\s\S]*)$/.exec(line);
    if (!match) {
      // Una línea sin la marca `[hablante]` es la continuación del segmento anterior:
      // `buildTranscriptText` une los segmentos con '\n', así que un segmento cuyo propio
      // contenido traiga saltos de línea queda repartido en varias líneas. Descartarlas
      // perdería texto clínico en silencio, así que se anexan al turno en curso.
      if (turns.length > 0 && line.trim()) {
        turns[turns.length - 1].content += `\n${line}`;
      }
      continue;
    }
    const [, rawSpeaker, content] = match;
    if (!content.trim()) continue;
    turns.push({ speaker: rawSpeaker === 'desconocido' ? null : rawSpeaker, content });
  }
  return turns;
}

// ─── Legacy layer compatibility (§6) ───────────────────────────────────────────
const LEGACY_LAYER_TO_DOCUMENT_TYPE_KEY: Record<number, string> = {
  1: 'base_extraction',
  2: 'clinical_report',
  3: 'patient_report',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authenticated user and verify they belong to the requested center
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return unauthorizedResponse(corsHeaders);
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt);
  const role = (claimsData?.claims as { role?: string; sub?: string })?.role;
  const userId = (claimsData?.claims as { role?: string; sub?: string })?.sub;
  if (claimsError || (role !== 'authenticated' && role !== 'service_role')) {
    return unauthorizedResponse(corsHeaders);
  }

  try {
    const body = await req.json();
    let documentTypeKey: string | undefined = body.documentTypeKey;
    const {
      centerId,
      sessionId,
      patientId: requestPatientId,
      sourceSessionIds,
      transcription,
      segments,
      transcriptSource,
      plaudRecordingId,
      inputs,
      regenerate,
      layer,
      model: requestedModel,
    } = body;

    // `model` del request (§2.2 de CONTRACT-2): texto libre que llega del cliente y que,
    // como el de la plantilla y el del centro, termina interpolado en la URL de Gemini —
    // se sanea aquí, en cuanto entra, antes de que nada más lo toque.
    const requestModel: string | null =
      typeof requestedModel === 'string' && requestedModel.trim().length > 0
        ? sanitizeModelName(requestedModel, 'solicitado para esta generación')
        : null;

    // Usado tanto para resolver la plantilla propia del profesional (§1.1) como para la
    // versión de prompt (§4) y la autoría del documento generado.
    const professionalId = role === 'authenticated' ? (userId ?? null) : null;

    // ─── Connection test ─────────────────────────────────────────────────────
    // Settings → Inteligencia Artificial needs a way to check that the center's
    // provider and API key actually work. It cannot go through the normal path:
    // there is no session and therefore no patient, and the consent gate below
    // fails closed without one — which is why the old "Verificar conexión"
    // button returned 400 every single time.
    //
    // This branch is safe precisely because it never touches patient data: it
    // sends a fixed, content-free probe string, stores nothing, and audits
    // nothing clinical. Auth and center membership are still enforced.
    if (body.connectionTest === true) {
      if (!centerId) {
        return jsonResponse({ error: 'Falta el centro para verificar la conexión.' }, 400);
      }

      const testClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      if (role === 'authenticated' && userId) {
        const { data: prof } = await testClient.from('profiles').select('center_id').eq('id', userId).maybeSingle();
        if (!prof || (prof as { center_id: string | null }).center_id !== centerId) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
      }

      const testConfig = await loadCenterAiConfig(testClient, centerId);
      const reply = await callAIWithRetry(
        'Responde únicamente con la palabra OK.',
        'Responde OK.',
        testConfig.provider,
        testConfig.model,
        testConfig.apiKey,
        0,
        16,
        false,
      );

      console.log(`[analyze] Connection test OK — provider: ${testConfig.provider}, model: ${testConfig.model}`);
      return jsonResponse({
        success: true,
        connectionTest: true,
        provider: testConfig.provider,
        model: testConfig.model,
        reply: reply.trim().slice(0, 40),
      }, 200);
    }

    // ─── Compatibilidad con el sistema de "3 capas" ─────────────────────────
    // Si llega `layer` y no `documentTypeKey`, se traduce a la plantilla de sistema
    // equivalente. Esto permite desplegar esta función y el cliente por separado: un
    // cliente todavía no actualizado sigue funcionando contra la nueva función.
    if (!documentTypeKey && (layer === 1 || layer === 2 || layer === 3)) {
      documentTypeKey = LEGACY_LAYER_TO_DOCUMENT_TYPE_KEY[layer];
      console.warn(`[analyze] Compatibilidad: layer=${layer} traducido a documentTypeKey="${documentTypeKey}". Actualiza el llamador para enviar documentTypeKey directamente.`);
    }

    if (!documentTypeKey) {
      return jsonResponse({ error: 'Se requiere documentTypeKey (o, en modo de compatibilidad, layer: 1, 2 o 3).' }, 400);
    }
    if (!centerId) {
      return jsonResponse({ error: 'Se requiere centerId.' }, 400);
    }

    // ─── Entrada de la transcripción ──────────────────────────────────────────
    // Dos formas de aportar el contenido de la sesión, pensadas para coexistir:
    //
    // 1) `transcription` (string) — el flujo de siempre: texto plano generado
    //    por Whisper a partir de un audio subido a mano. Sigue funcionando
    //    exactamente igual, sin ningún cambio de comportamiento.
    //
    // 2) `segments` (DiarizedTurn[]) — pensado para una transcripción ya
    //    diarizada por un proveedor externo (Plaud: `plaud_recordings.
    //    transcript_text`). Cada elemento es `{ speaker, content }` (acepta
    //    también `startTime`/`endTime` sin usarlos, para poder pasar
    //    directamente objetos con la forma de `TranscriptSegment` de
    //    src/lib/plaud-segmentation.ts sin transformarlos). Se prefiere una
    //    ruta separada por `segments` — en vez de forzar al llamador a
    //    aplanar la diarización en un string con su propio formato de
    //    "Speaker: texto" — porque así la anonimización de la etiqueta de
    //    hablante (ver transcriptDiarization.ts) la controla siempre esta
    //    función, nunca el llamador: ningún nombre real que Plaud pueda
    //    meter en `speaker` tiene camino para llegar aquí como texto libre
    //    ya mezclado con el contenido.
    //
    // `transcriptSource` ('manual' | 'plaud') y `plaudRecordingId` son solo
    // metadatos para el registro de auditoría y para `ai_generated_documents`:
    // no cambian la lógica de generación ni el control de consentimiento, que
    // se aplica exactamente igual sea cual sea el origen.
    //
    // Ambas rutas solo aplican a plantillas de ámbito `session`. Las plantillas
    // `multi_session` (informe de evolución, informe de alta) no reciben una
    // transcripción: su entrada son los documentos ya generados del paciente
    // (ver `loadPatientPriorDocuments`), montados en el prompt más abajo.
    //
    // Punto de enganche para cuando una grabación de Plaud quede emparejada
    // y confirmada (fuera de este ámbito: la tabla `plaud_recordings` y su
    // UI de confirmación las está construyendo otro agente en paralelo):
    // quien dispare la generación de informes tras la confirmación debe
    // leer `plaud_recordings.transcript_text`, convertirlo en `DiarizedTurn[]`
    // y llamar a esta función una vez por plantilla de documento con
    // `{ sessionId, centerId, documentTypeKey, segments, transcriptSource: 'plaud', plaudRecordingId }`.
    // Esta función no consulta `plaud_recordings` por sí misma ni dispara
    // nada automáticamente: la generación sigue siendo una acción explícita.
    const rawSegments: DiarizedTurn[] = Array.isArray(segments) ? segments : [];
    const hasSegments = rawSegments.some(
      (s) => s && typeof s === 'object' && typeof (s as { content?: unknown }).content === 'string' && (s as { content: string }).content.trim().length > 0
    );
    const hasTranscriptionText = typeof transcription === 'string' && transcription.trim().length > 0;

    let effectiveTranscription: string | null = null;
    let diarizationApplied = false;
    if (hasSegments) {
      const built = buildTranscriptFromTurns(rawSegments);
      diarizationApplied = built.hasDiarization;
      effectiveTranscription = built.transcript.trim() || (hasTranscriptionText ? transcription : null);
    } else if (hasTranscriptionText) {
      effectiveTranscription = transcription;
    }

    // `let`, not `const`: both are overwritten further down by the Plaud saved-transcript
    // fallback when the request arrives with neither `transcription` nor `segments` (see
    // that block, right after the consent gate).
    let originSource = transcriptSource === 'plaud' ? 'plaud' : 'manual';
    let effectivePlaudRecordingId: string | null = typeof plaudRecordingId === 'string' ? plaudRecordingId : null;

    // Single service-role client reused for center validation, consent checks,
    // AI configuration lookup, template/prompt resolution and audit logging.
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate caller belongs to requested center (skip for service_role)
    if (role === 'authenticated' && centerId && userId) {
      const { data: prof } = await supabaseService.from('profiles').select('center_id').eq('id', userId).maybeSingle();
      if (!prof || (prof as { center_id: string | null }).center_id !== centerId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── Load the requested document type ─────────────────────────────────────
    const docType = await loadDocumentType(supabaseService, documentTypeKey, centerId, professionalId);
    if (!docType) {
      return jsonResponse({ error: `No existe la plantilla de documento "${documentTypeKey}" para este centro.` }, 400);
    }

    if (docType.scope !== 'session' && docType.scope !== 'multi_session') {
      return jsonResponse({ error: `El ámbito "${docType.scope}" de la plantilla "${docType.label}" todavía no está soportado.` }, 400);
    }

    // ─── Resolve sessionId / patientId / sessionTypeId depending on scope ──────
    let patientId: string | null = null;
    let sessionTypeId: string | null = null;

    if (docType.scope === 'session') {
      if (!sessionId) {
        return jsonResponse({ error: 'Esta plantilla requiere sessionId.' }, 400);
      }
      // NOTE: no longer 400s here when there is neither `transcription` nor `segments`.
      // The client may be regenerating a document after closing the dialog that held the
      // transcription in memory — in that case we try the Plaud saved-transcript fallback
      // (see below), but only AFTER the consent gate, since reusing a stored transcript is
      // handling patient data exactly like receiving it fresh from the caller.

      // ─── Consent gate: never send session content to the AI provider without ──
      // the patient's consent. The client always supplies sessionId (the dialog only
      // opens against a real session — see TranscriptionAnalysisDialog.tsx). Without it
      // we cannot identify the patient, so we fail closed rather than skip the check.
      const { data: sessionRow } = await supabaseService
        .from('sessions')
        .select('patient_id, session_type_id')
        .eq('id', sessionId)
        .maybeSingle();
      patientId = (sessionRow as { patient_id: string | null } | null)?.patient_id ?? null;
      sessionTypeId = (sessionRow as { session_type_id: string | null } | null)?.session_type_id ?? null;

      if (!patientId) {
        return jsonResponse(
          { error: 'No se pudo verificar el consentimiento del contacto: falta la sesión o el contacto asociado.' },
          400
        );
      }
    } else {
      // scope === 'multi_session'
      if (!requestPatientId) {
        return jsonResponse({ error: 'Esta plantilla requiere patientId.' }, 400);
      }
      const { data: patientRow } = await supabaseService
        .from('patients')
        .select('id, center_id')
        .eq('id', requestPatientId)
        .maybeSingle();
      if (!patientRow || (patientRow as { center_id: string }).center_id !== centerId) {
        return jsonResponse({ error: 'El contacto indicado no pertenece a este centro.' }, 403);
      }
      patientId = requestPatientId;
    }

    // ─── Consentimiento: se mantiene íntegro y sigue fallando cerrado. La única ──
    // diferencia con el sistema de capas es que los propósitos exigidos salen de
    // `required_consent_purposes` de la plantilla en vez de estar hardcodeados.
    const requiredPurposes: ConsentPurpose[] =
      docType.required_consent_purposes && docType.required_consent_purposes.length > 0
        ? (docType.required_consent_purposes as ConsentPurpose[])
        : ['ai_processing', 'report_generation'];

    const consentResults = await Promise.all(
      requiredPurposes.map((purpose) => checkPatientConsent(supabaseService, patientId!, purpose))
    );
    const deniedIndex = consentResults.findIndex((r) => !r.granted);

    if (deniedIndex !== -1) {
      const deniedPurpose = requiredPurposes[deniedIndex];
      const deniedResult: ConsentCheckResult = consentResults[deniedIndex];

      if (centerId) {
        logAuditEvent({
          supabase: supabaseService, req,
          userId: null,
          organizationId: centerId,
          patientId,
          resourceType: 'clinical_notes',
          action: 'ACCESS_DENIED',
          status: 'denied',
          routeOrEndpoint: 'analyze-session-transcription',
          metadata: {
            documentTypeKey, purpose: deniedPurpose, reason: deniedResult.reason, sessionId: sessionId ?? null,
            transcriptSource: originSource,
            ...(plaudRecordingId ? { plaudRecordingId } : {}),
          },
        });
      }

      return jsonResponse(
        {
          error: 'No se puede generar el documento: el contacto no ha otorgado el consentimiento necesario para el procesamiento por IA.',
          consentDenied: true,
          purpose: deniedPurpose,
          reason: deniedResult.reason,
        },
        403
      );
    }

    // ─── Fallback: transcripción guardada (pipeline nuevo y Plaud legado) ─────
    // Solo para plantillas de ámbito `session` y solo cuando el cliente no ha mandado
    // `transcription` ni `segments` (p. ej. el profesional cerró el diálogo y ha vuelto a
    // pulsar "Regenerar", sin la transcripción ya en memoria del navegador). Se ejecuta
    // aquí a propósito, DESPUÉS de la puerta de consentimiento: leer una transcripción
    // guardada de `plaud_recordings` es tratar datos del paciente exactamente igual que
    // recibirla del llamador, así que tiene que pasar por la misma verificación.
    if (docType.scope === 'session' && !effectiveTranscription) {
      const nowIso = new Date().toISOString();
      const { data: savedTranscripts, error: transcriptsError } = await supabaseService
        .from('transcripts')
        .select('id, normalized_text, expires_at')
        .eq('session_id', sessionId)
        .is('deleted_at', null)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (transcriptsError) {
        console.error('[analyze] Error al buscar transcripción normalizada para la sesión:', transcriptsError.message);
      }

      const validTranscript = savedTranscripts as {
        id: string;
        normalized_text: string;
        expires_at: string;
      } | null;

      if (validTranscript?.normalized_text?.trim()) {
        effectiveTranscription = validTranscript.normalized_text.trim();
        originSource = 'saved_transcript';
        console.log(`[analyze] Transcripción recuperada de transcripts (${validTranscript.id}) para la sesión ${sessionId}, vigente hasta ${validTranscript.expires_at}.`);
      }

      // Solo se consulta Plaud (legado) si la tabla `transcripts` (pipeline activo) no dio
      // resultado — evita una segunda ronda a la base de datos cuando ya hay transcripción.
      let hadAnyPlaudRecording = false;
      if (!effectiveTranscription) {
        const { data: recordings, error: recordingsError } = await supabaseService
          .from('plaud_recordings')
          .select('id, transcript_text, transcript_expires_at')
          .eq('session_id', sessionId)
          .order('transcript_fetched_at', { ascending: false });

        if (recordingsError) {
          console.error('[analyze] Error al buscar grabación de Plaud para la sesión:', recordingsError.message);
        }
        hadAnyPlaudRecording = (recordings ?? []).length > 0;

        const validRecording = (recordings ?? []).find(
          (r) => typeof r.transcript_text === 'string' && r.transcript_text.trim().length > 0
            && typeof r.transcript_expires_at === 'string' && r.transcript_expires_at > nowIso
        ) as { id: string; transcript_text: string; transcript_expires_at: string } | undefined;

        if (validRecording) {
          const turns = parseStoredPlaudTranscript(validRecording.transcript_text);
          const built = buildTranscriptFromTurns(turns);
          const rebuilt = built.transcript.trim();
          if (rebuilt) {
            effectiveTranscription = rebuilt;
            diarizationApplied = built.hasDiarization;
            originSource = 'plaud';
            effectivePlaudRecordingId = validRecording.id;
            console.log(`[analyze] Transcripción recuperada de plaud_recordings (${validRecording.id}) para la sesión ${sessionId}, vigente hasta ${validRecording.transcript_expires_at}.`);
          }
        }
      }

      if (!effectiveTranscription) {
        const hadAnySavedTranscript = !!savedTranscripts || hadAnyPlaudRecording;
        const message = hadAnySavedTranscript
          ? 'La transcripción de esta sesión ya no está disponible: se conserva durante 30 días y ese plazo ya ha pasado. Sube el audio de la sesión o pega la transcripción manualmente.'
          : 'No hay ninguna transcripción guardada disponible para esta sesión. Sube el audio de la sesión o pega la transcripción manualmente.';
        return jsonResponse({ error: message }, 400);
      }
    }

    // ─── Load center AI configuration ────────────────────────────────────────
    const { provider, model, apiKey, temperature, systemPrompt } = await loadCenterAiConfig(supabaseService, centerId);

    console.log(`[analyze] documentTypeKey: ${documentTypeKey} | Provider: ${provider} | Model: ${model} | Temp: ${temperature} | Source: ${originSource} | Diarization: ${diarizationApplied}`);

    // ─── Resolver `requires` recursivamente y generar el documento pedido ──────
    const ctx: GenerationContext = {
      supabaseService,
      req,
      centerId,
      professionalId,
      regenerate: regenerate === true,
      aiConfig: { provider, model, apiKey, temperature, systemPrompt },
      requestModel,
      sessionId: docType.scope === 'session' ? sessionId : null,
      sessionTypeId,
      effectiveTranscription,
      transcriptSource: originSource,
      plaudRecordingId: effectivePlaudRecordingId,
      patientId: patientId!,
      sourceSessionIds: Array.isArray(sourceSessionIds) ? sourceSessionIds : null,
      inputs: inputs && typeof inputs === 'object' ? inputs : null,
      visiting: new Set<string>(),
      cache: new Map<string, GeneratedResult>(),
    };

    let result: GeneratedResult;
    try {
      result = await resolveDocument(documentTypeKey, 0, ctx);
    } catch (error) {
      if (error instanceof UserFacingError) {
        console.error(`[analyze] ${error.message}`);
        return jsonResponse({ error: error.message }, error.status);
      }
      throw error;
    }

    const dependencies = (docType.requires ?? []).map((depKey) => {
      const dep = ctx.cache.get(depKey);
      return { key: depKey, documentId: dep?.documentId ?? null, reused: dep?.reused ?? false };
    });

    // Audit: transcription analysis performed — consent was verified above
    logAuditEvent({
      supabase: supabaseService, req,
      userId: null,
      organizationId: centerId,
      patientId,
      resourceType: 'clinical_notes', action: 'VIEW',
      routeOrEndpoint: 'analyze-session-transcription',
      metadata: {
        documentTypeKey, promptVersionId: result.promptVersionId, consentVerified: true,
        transcriptSource: originSource, diarizationApplied,
        sessionId: sessionId ?? null,
        dependencies: dependencies.map((d) => d.key),
        ...(effectivePlaudRecordingId ? { plaudRecordingId: effectivePlaudRecordingId } : {}),
      },
    });

    return jsonResponse(
      {
        success: true,
        documentId: result.documentId,
        documentTypeKey: result.documentTypeKey,
        sections: result.sections,
        markdown: result.markdown,
        promptVersionId: result.promptVersionId,
        modelUsed: result.modelUsed,
        dependencies,
      },
      200
    );

  } catch (error) {
    console.error('Error in analyze-session-transcription:', error);

    // UserFacingError carries a message already written for the therapist ("API key de
    // OpenAI no configurada…", "No existe la plantilla…") plus its own status. Masking it
    // behind a generic 500 is what makes these failures undebuggable from the UI: the user
    // is told "error interno" when the actual fix is one click away in Settings.
    if (error instanceof UserFacingError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    // A provider rejection is not an internal error either: it usually means a bad key,
    // an exhausted quota or a model the center no longer has access to.
    if (error instanceof ProviderError) {
      return jsonResponse(
        { error: `El proveedor de IA ha rechazado la petición: ${error.message}` },
        502
      );
    }

    return jsonResponse({ error: 'Error interno del servidor' }, 500);
  }
});

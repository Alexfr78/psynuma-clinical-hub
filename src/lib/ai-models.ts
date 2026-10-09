/**
 * Catálogo de modelos de IA que ofrece la interfaz, por proveedor.
 *
 * Fuente única: lo consumen tanto Ajustes → Inteligencia Artificial (el modelo del centro)
 * como el editor de plantillas (el modelo por versión de prompt) y el diálogo de generación
 * (el modelo puntual de una generación). Tenerlo repetido en cada pantalla hacía que añadir
 * un modelo nuevo en una y olvidarlo en otra pasara desapercibido.
 *
 * No es una lista cerrada: todas esas pantallas ofrecen además "Modelo personalizado", porque
 * los proveedores publican modelos nuevos más deprisa de lo que se actualiza esta constante.
 * El servidor sanea cualquier nombre de modelo antes de usarlo (ver `sanitizeModelName` en
 * `supabase/functions/analyze-session-transcription/index.ts`).
 */

export interface AiModelOption {
  value: string;
  /** Etiqueta con la ventaja del modelo, para que se pueda elegir sin saberse el catálogo. */
  label: string;
}

export const OPENAI_MODEL_OPTIONS: AiModelOption[] = [
  { value: 'gpt-6-astra', label: 'GPT-6 Astra — Máxima capacidad, el más caro' },
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol — Casi como Astra, más barato (recomendado)' },
  { value: 'gpt-6-luna', label: 'GPT-6 Luna — Rápido y económico' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — Generación anterior, alta capacidad' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — Equilibrio calidad/coste' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — Muy económico' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-4.1', label: 'GPT-4.1 — Sin razonamiento, admite temperatura' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — Sin razonamiento, económico' },
  { value: 'gpt-4o', label: 'GPT-4o (legacy)' },
];

export const GEMINI_MODEL_OPTIONS: AiModelOption[] = [
  { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — El más nuevo' },
  { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash — Generación anterior' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — Generación anterior' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — Más económico' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro — Máxima capacidad (vista previa)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (solo cuentas que ya lo usaban)' },
];

/**
 * Modelos de transcripción de audio (speech-to-text) de OpenAI. Catálogo aparte del de
 * redacción: se eligen por criterios distintos (diarización y coste por minuto, no
 * capacidad de razonamiento). El valor por defecto vive también en
 * `supabase/functions/_shared/openaiTranscriptionProvider.ts` (DEFAULT_STT_MODEL);
 * si cambia uno, cambia el otro.
 */
export const STT_MODEL_OPTIONS: AiModelOption[] = [
  { value: 'gpt-4o-transcribe-diarize', label: 'GPT-4o Transcribe Diarize — Distingue quién habla (recomendado)' },
  { value: 'gpt-transcribe', label: 'GPT Transcribe — Mejor calidad, sin distinguir hablantes' },
  { value: 'whisper-1', label: 'Whisper (antiguo) — Sin hablantes' },
];

export const DEFAULT_STT_MODEL = 'gpt-4o-transcribe-diarize';

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Si el modelo acepta el ajuste de temperatura. Los modelos de OpenAI con razonamiento
 * (GPT-5.x, GPT-6.x, serie o) devuelven error 400 si se les manda; solo la familia GPT-4 /
 * GPT-3.5 la admite. Ante un nombre desconocido se asume que no, porque no mandarla nunca
 * falla. Gemini 3 la acepta, pero Google pide dejarla en su valor por defecto (con valores
 * bajos puede entrar en bucles), así que tampoco se manda. Misma regla que `modelSupportsTemperature` en
 * `supabase/functions/analyze-session-transcription/index.ts`; si cambia una, cambia la otra.
 */
export function modelSupportsTemperature(provider: string | null | undefined, model: string): boolean {
  if (provider === 'gemini') return !/^gemini-3/i.test(model.trim());
  return /^gpt-(4|3\.5)/i.test(model.trim());
}

/** Modelos que corresponden al proveedor configurado en el centro. */
export function modelOptionsForProvider(provider: string | null | undefined): AiModelOption[] {
  return provider === 'gemini' ? GEMINI_MODEL_OPTIONS : OPENAI_MODEL_OPTIONS;
}

/** Modelo por defecto del proveedor, cuando el centro no tiene ninguno guardado. */
export function defaultModelForProvider(provider: string | null | undefined): string {
  return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
}

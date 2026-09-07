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
  { value: 'gpt-4.1', label: 'GPT-4.1 — Máxima capacidad (recomendado)' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — Equilibrio calidad/coste' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano — Más económico' },
  { value: 'gpt-4o', label: 'GPT-4o (legacy)' },
  { value: 'o1', label: 'o1 — Razonamiento profundo' },
];

export const GEMINI_MODEL_OPTIONS: AiModelOption[] = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (recomendado)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Más rápido' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

/** Modelos que corresponden al proveedor configurado en el centro. */
export function modelOptionsForProvider(provider: string | null | undefined): AiModelOption[] {
  return provider === 'gemini' ? GEMINI_MODEL_OPTIONS : OPENAI_MODEL_OPTIONS;
}

/** Modelo por defecto del proveedor, cuando el centro no tiene ninguno guardado. */
export function defaultModelForProvider(provider: string | null | undefined): string {
  return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
}

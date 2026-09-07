/**
 * Tipos de las plantillas de documentos clínicos generados con IA.
 *
 * Sustituyen al sistema de "3 capas" fijas (centers.ai_prompt_layer1/2/3): un documento
 * es ahora una plantilla (`ai_document_types`) + una versión de prompt (`ai_prompt_versions`),
 * y cada generación queda registrada en `ai_generated_documents` con el sello de la versión
 * que la produjo.
 *
 * Estos tipos se mantienen a mano porque `src/integrations/supabase/types.ts` es autogenerado
 * y todavía no incluye las tablas nuevas.
 */

export type AiDocumentAudience = 'professional' | 'patient' | 'internal' | 'third_party';

export type AiDocumentScope = 'session' | 'multi_session' | 'patient';

/** Columna de `sessions` que refleja el markdown del documento, mientras dure la transición. */
export type AiMirrorColumn = 'ai_summary_clinical' | 'ai_summary_patient';

/** Una sección declarada por la plantilla. El modelo debe devolver una clave por sección. */
export interface AiDocumentSection {
  key: string;
  label: string;
  required: boolean;
  /** Si la sección puede compartirse con el paciente. */
  shareable: boolean;
}

export interface AiDocumentType {
  id: string;
  /** NULL en las plantillas de sistema, comunes a todos los centros. */
  center_id: string | null;
  key: string;
  label: string;
  description: string | null;
  audience: AiDocumentAudience;
  scope: AiDocumentScope;
  /** Keys de otras plantillas que este documento consume como entrada. */
  requires: string[];
  sections: AiDocumentSection[];
  input_schema: Record<string, unknown>;
  required_consent_purposes: string[];
  mirror_column: AiMirrorColumn | null;
  /** Prompt de usuario semilla de la plantilla. Fallback cuando no hay ninguna versión
   *  publicada aplicable en `ai_prompt_versions` (§4 regla 4 del contrato). */
  default_user_prompt: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AiPromptVersion {
  id: string;
  document_type_id: string;
  center_id: string;
  version: number;
  system_prompt: string | null;
  user_prompt: string;
  model: string | null;
  temperature: number | null;
  /** NULL = comodín: aplica a todo el centro. */
  professional_id: string | null;
  /** NULL = comodín: aplica a cualquier tipo de sesión. */
  session_type_id: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AiGeneratedDocument {
  id: string;
  center_id: string;
  session_id: string | null;
  patient_id: string;
  document_type_id: string;
  /** NULL solo en las filas heredadas del backfill. */
  prompt_version_id: string | null;
  source_session_ids: string[];
  content_sections: Record<string, string>;
  content_markdown: string;
  edited_sections: Record<string, string> | null;
  edited_markdown: string | null;
  transcript_source: string | null;
  plaud_recording_id: string | null;
  model_used: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  generated_by: string | null;
  generated_at: string;
}

/** Documento con su plantilla resuelta, tal y como lo consumen las vistas. */
export interface AiGeneratedDocumentWithType extends AiGeneratedDocument {
  document_type: Pick<AiDocumentType, 'key' | 'label' | 'audience' | 'sections' | 'mirror_column'>;
}

import { supabase } from '@/integrations/supabase/client';

/**
 * Acceso a las tablas de plantillas de documentos IA.
 *
 * `src/integrations/supabase/types.ts` es autogenerado y todavía no incluye
 * `ai_document_types`, `ai_prompt_versions` ni `ai_generated_documents`, así que las
 * consultas a esas tres tablas pasan por este cliente sin tipar. Los tipos de fila están
 * en `@/types/ai-documents` y se aplican a mano en cada consulta.
 *
 * Este helper desaparece en cuanto se regeneren los tipos: entonces basta con volver a
 * usar `supabase` directamente y borrar este fichero.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const aiDb = supabase as any;

export const AI_DOCUMENT_TABLES = {
  types: 'ai_document_types',
  versions: 'ai_prompt_versions',
  documents: 'ai_generated_documents',
} as const;

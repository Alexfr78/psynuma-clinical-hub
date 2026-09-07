import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { aiDb, AI_DOCUMENT_TABLES } from '@/lib/ai-documents-db';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type {
  AiDocumentType,
  AiDocumentAudience,
  AiDocumentScope,
  AiPromptVersion,
} from '@/types/ai-documents';

/**
 * Hooks TanStack Query para el catálogo de plantillas de documentos clínicos con IA
 * (`ai_document_types`, `ai_prompt_versions`). Sustituye a los 4 textarea fijos de
 * `centers.ai_prompt_layer1/2/3` por plantillas versionadas con ámbito por centro,
 * profesional o tipo de sesión.
 *
 * Usa `aiDb` (ver `@/lib/ai-documents-db`) para las dos tablas porque todavía no están
 * en `src/integrations/supabase/types.ts` (autogenerado, pendiente de regenerar tras la
 * migración). El resto de consultas (perfiles, tipos de sesión) usa el cliente tipado.
 */

/** Una versión de prompt con su ámbito resuelto a texto legible para la UI. */
export interface ResolvedPromptVersion extends AiPromptVersion {
  scopeLabel: string;
}

/** Ámbito elegido al crear una versión nueva. */
export type PromptVersionScope =
  | { kind: 'center' }
  | { kind: 'professional'; professionalId: string }
  | { kind: 'session_type'; sessionTypeId: string };

/** Catálogo de plantillas visibles para el centro: las de sistema (`center_id null`) + las propias. */
export function useAIDocumentTypes() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['ai-document-types', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .select('*')
        .or(`center_id.is.null,center_id.eq.${profile!.center_id}`)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as AiDocumentType[];
    },
    enabled: !!profile?.center_id,
  });
}

/**
 * Versiones de prompt de una plantilla, con el ámbito resuelto a texto legible
 * (nombre del profesional o del tipo de sesión en vez de solo el id).
 */
export function usePromptVersions(documentTypeId: string | undefined) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  const versionsQuery = useQuery({
    queryKey: ['ai-prompt-versions', documentTypeId, centerId],
    queryFn: async () => {
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.versions)
        .select('*')
        .eq('document_type_id', documentTypeId)
        .eq('center_id', centerId)
        .order('version', { ascending: false });

      if (error) throw error;
      return (data ?? []) as AiPromptVersion[];
    },
    enabled: !!documentTypeId && !!centerId,
  });

  const professionalIds = useMemo(
    () =>
      Array.from(
        new Set(
          (versionsQuery.data ?? [])
            .map((v) => v.professional_id)
            .filter((id): id is string => !!id)
        )
      ),
    [versionsQuery.data]
  );
  const sessionTypeIds = useMemo(
    () =>
      Array.from(
        new Set(
          (versionsQuery.data ?? [])
            .map((v) => v.session_type_id)
            .filter((id): id is string => !!id)
        )
      ),
    [versionsQuery.data]
  );

  const professionalsQuery = useQuery({
    queryKey: ['ai-prompt-versions-professionals', professionalIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', professionalIds);
      if (error) throw error;
      return data;
    },
    enabled: professionalIds.length > 0,
  });

  const sessionTypesQuery = useQuery({
    queryKey: ['ai-prompt-versions-session-types', sessionTypeIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_types')
        .select('id, name')
        .in('id', sessionTypeIds);
      if (error) throw error;
      return data;
    },
    enabled: sessionTypeIds.length > 0,
  });

  const versions: ResolvedPromptVersion[] = useMemo(() => {
    const professionals = professionalsQuery.data ?? [];
    const sessionTypes = sessionTypesQuery.data ?? [];
    return (versionsQuery.data ?? []).map((v) => {
      let scopeLabel = 'Todo el centro';
      if (v.professional_id) {
        const p = professionals.find((pr) => pr.id === v.professional_id);
        scopeLabel = p
          ? `Profesional: ${[p.first_name, p.last_name].filter(Boolean).join(' ')}`
          : 'Profesional concreto';
      } else if (v.session_type_id) {
        const st = sessionTypes.find((s) => s.id === v.session_type_id);
        scopeLabel = st ? `Tipo de sesión: ${st.name}` : 'Tipo de sesión concreto';
      }
      return { ...v, scopeLabel };
    });
  }, [versionsQuery.data, professionalsQuery.data, sessionTypesQuery.data]);

  return {
    versions,
    isLoading: versionsQuery.isLoading,
  };
}

interface CreatePromptVersionInput {
  documentTypeId: string;
  systemPrompt: string | null;
  userPrompt: string;
  model?: string | null;
  temperature?: number | null;
  scope: PromptVersionScope;
}

/**
 * Crea una versión nueva de prompt, siempre como borrador (`is_published: false`).
 * Nunca edita una versión existente: el servidor lo impide con un trigger (una versión
 * publicada es inmutable), así que aquí no hay "actualizar versión", solo "crear y
 * publicar cuando esté lista".
 */
export function useCreatePromptVersion() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreatePromptVersionInput) => {
      if (!profile?.center_id) throw new Error('No hay centro asignado');

      // La unicidad es (document_type_id, center_id, version): el número de versión
      // se calcula sobre TODAS las versiones de la plantilla en el centro, sin
      // importar su ámbito.
      const { data: existing, error: maxError } = await aiDb
        .from(AI_DOCUMENT_TABLES.versions)
        .select('version')
        .eq('document_type_id', input.documentTypeId)
        .eq('center_id', profile.center_id)
        .order('version', { ascending: false })
        .limit(1);
      if (maxError) throw maxError;
      const nextVersion = (existing?.[0]?.version ?? 0) + 1;

      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.versions)
        .insert({
          document_type_id: input.documentTypeId,
          center_id: profile.center_id,
          version: nextVersion,
          system_prompt: input.systemPrompt,
          user_prompt: input.userPrompt,
          model: input.model ?? null,
          temperature: input.temperature ?? null,
          professional_id: input.scope.kind === 'professional' ? input.scope.professionalId : null,
          session_type_id: input.scope.kind === 'session_type' ? input.scope.sessionTypeId : null,
          is_published: false,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AiPromptVersion;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompt-versions', data.document_type_id] });
      toast.success('Versión guardada como borrador');
    },
    onError: (error) => {
      toast.error('Error al crear la versión');
      console.error(error);
    },
  });
}

/** Publica una versión en borrador. Una vez publicada, deja de poder editarse. */
export function usePublishPromptVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; documentTypeId: string }) => {
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.versions)
        .update({ is_published: true })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as AiPromptVersion;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompt-versions', variables.documentTypeId] });
      toast.success('Versión publicada: se usará en las próximas generaciones que casen con su ámbito');
    },
    onError: (error) => {
      toast.error('Error al publicar la versión');
      console.error(error);
    },
  });
}

interface DocumentTypeUpsertInput {
  key: string;
  label: string;
  description?: string | null;
  audience: AiDocumentAudience;
  scope: AiDocumentScope;
  sortOrder?: number;
}

/** Crea una plantilla nueva del centro, desde cero (sin secciones propias todavía). */
export function useCreateDocumentType() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: DocumentTypeUpsertInput) => {
      if (!profile?.center_id) throw new Error('No hay centro asignado');
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .insert({
          center_id: profile.center_id,
          key: input.key,
          label: input.label,
          description: input.description ?? null,
          audience: input.audience,
          scope: input.scope,
          requires: [],
          sections: [],
          input_schema: {},
          required_consent_purposes: ['ai_processing', 'report_generation'],
          mirror_column: null,
          is_active: true,
          sort_order: input.sortOrder ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AiDocumentType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-types'] });
      toast.success('Plantilla creada');
    },
    onError: (error) => {
      toast.error('Error al crear la plantilla. Comprueba que la clave no esté repetida.');
      console.error(error);
    },
  });
}

/** Edita los metadatos de una plantilla del centro (no toca `sections` ni `requires`). */
export function useUpdateDocumentType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Omit<AiDocumentType, 'id'>> & { id: string }) => {
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as AiDocumentType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-types'] });
      toast.success('Plantilla actualizada');
    },
    onError: (error) => {
      toast.error('Error al actualizar la plantilla');
      console.error(error);
    },
  });
}

/** Activa o desactiva una plantilla del centro (no elimina el historial de versiones). */
export function useSetDocumentTypeActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-types'] });
      toast.success(variables.isActive ? 'Plantilla activada' : 'Plantilla desactivada');
    },
    onError: (error) => {
      toast.error('Error al cambiar el estado de la plantilla');
      console.error(error);
    },
  });
}

/**
 * Duplica una plantilla de sistema como plantilla del centro, con la MISMA `key`.
 * Esto no es casual: la resolución de plantillas busca primero por `key` en el centro
 * y solo si no la encuentra cae a la de sistema, así que una copia del centro con la
 * misma key la sustituye de forma transparente para todo lo que ya use esa plantilla.
 */
export function useDuplicateSystemDocumentType() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (source: AiDocumentType) => {
      if (!profile?.center_id) throw new Error('No hay centro asignado');
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .insert({
          center_id: profile.center_id,
          key: source.key,
          label: source.label,
          description: source.description,
          audience: source.audience,
          scope: source.scope,
          requires: source.requires,
          sections: source.sections,
          input_schema: source.input_schema,
          required_consent_purposes: source.required_consent_purposes,
          mirror_column: source.mirror_column,
          is_active: true,
          sort_order: source.sort_order,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AiDocumentType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-types'] });
      toast.success('Plantilla duplicada para el centro. Ya puedes personalizarla.');
    },
    onError: (error) => {
      toast.error('Error al duplicar. Es posible que el centro ya tenga una copia de esta plantilla.');
      console.error(error);
    },
  });
}

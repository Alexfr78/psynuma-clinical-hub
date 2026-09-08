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
  AiDocumentDefault,
  AiDocumentDefaultAudience,
} from '@/types/ai-documents';

/** Nombre de la tabla de predeterminadas. No está en `AI_DOCUMENT_TABLES` (ese objeto
 *  vive en `@/lib/ai-documents-db.ts`, fuera de este lote) así que se usa el literal aquí. */
const AI_DOCUMENT_DEFAULTS_TABLE = 'ai_document_defaults';

/** Keys de las plantillas de sistema usadas como último fallback de cada destinatario
 *  (CONTRACT-2 §1.2: "la plantilla de sistema de referencia"). */
const SYSTEM_FALLBACK_KEY_BY_AUDIENCE: Record<AiDocumentDefaultAudience, string> = {
  professional: 'clinical_report',
  patient: 'patient_report',
};

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
  /** Para "duplicar una existente" (CONTRACT-2 §3.2): copia estos campos de la plantilla
   *  de origen. Si se omiten, la plantilla se crea desde cero (sin secciones). */
  duplicateFrom?: Pick<
    AiDocumentType,
    'requires' | 'sections' | 'input_schema' | 'required_consent_purposes' | 'mirror_column'
  >;
}

/**
 * Crea una plantilla nueva, propia del que la crea: del centro si es admin
 * (`professional_id: null`), o suya si es profesional (`professional_id: <su id>`).
 * Partiendo de cero o duplicando otra existente (`duplicateFrom`).
 */
export function useCreateDocumentType() {
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useAuth();

  return useMutation({
    mutationFn: async (input: DocumentTypeUpsertInput) => {
      if (!profile?.center_id) throw new Error('No hay centro asignado');
      const source = input.duplicateFrom;
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_TABLES.types)
        .insert({
          center_id: profile.center_id,
          professional_id: isAdmin ? null : profile.id,
          key: input.key,
          label: input.label,
          description: input.description ?? null,
          audience: input.audience,
          scope: input.scope,
          requires: source?.requires ?? [],
          sections: source?.sections ?? [],
          input_schema: source?.input_schema ?? {},
          required_consent_purposes: source?.required_consent_purposes ?? [
            'ai_processing',
            'report_generation',
          ],
          mirror_column: source?.mirror_column ?? null,
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

/**
 * Elimina definitivamente una plantilla propia (del centro o de un profesional). Nunca se
 * ofrece para plantillas de sistema (`center_id === null`): esas se duplican, no se borran.
 * Borra en cascada su historial de versiones de prompt vía FK en la base de datos.
 */
export function useDeleteDocumentType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await aiDb.from(AI_DOCUMENT_TABLES.types).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-types'] });
      queryClient.invalidateQueries({ queryKey: ['ai-document-defaults'] });
      toast.success('Plantilla eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar la plantilla');
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
          professional_id: null,
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

// ---------------------------------------------------------------------------
// Predeterminadas por destinatario (`ai_document_defaults`, CONTRACT-2 §1.2)
// ---------------------------------------------------------------------------

/** Todas las filas de predeterminadas visibles del centro (de centro y de cada profesional). */
export function useAIDocumentDefaults() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['ai-document-defaults', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await aiDb
        .from(AI_DOCUMENT_DEFAULTS_TABLE)
        .select('*')
        .eq('center_id', profile!.center_id);
      if (error) throw error;
      return (data ?? []) as AiDocumentDefault[];
    },
    enabled: !!profile?.center_id,
  });
}

/** Resultado de resolver la predeterminada efectiva de un destinatario para el usuario actual. */
export interface ResolvedDefault {
  documentType: AiDocumentType | null;
  /** De quién es la predeterminada que se está mostrando. */
  source: 'professional' | 'center' | 'system' | 'none';
  /** Predeterminada del centro, aunque el profesional tenga la suya propia (para poder
   *  mostrar "sustituye a la del centro: X"). `null` si el centro tampoco tiene una. */
  centerDocumentType: AiDocumentType | null;
}

/**
 * Resuelve la predeterminada efectiva de un destinatario con la precedencia del contrato:
 * fila del profesional → fila del centro → plantilla de sistema de referencia.
 */
export function resolveDocumentDefault(
  audience: AiDocumentDefaultAudience,
  defaults: AiDocumentDefault[],
  documentTypes: AiDocumentType[],
  professionalId: string | undefined
): ResolvedDefault {
  const byId = (id: string | undefined | null) =>
    id ? documentTypes.find((dt) => dt.id === id) ?? null : null;

  const ownRow = professionalId
    ? defaults.find((d) => d.audience === audience && d.professional_id === professionalId)
    : undefined;
  const centerRow = defaults.find((d) => d.audience === audience && d.professional_id === null);
  const centerDocumentType =
    byId(centerRow?.document_type_id) ??
    documentTypes.find(
      (dt) => dt.center_id === null && dt.professional_id === null && dt.key === SYSTEM_FALLBACK_KEY_BY_AUDIENCE[audience]
    ) ??
    null;

  if (ownRow) {
    const dt = byId(ownRow.document_type_id);
    if (dt) return { documentType: dt, source: 'professional', centerDocumentType };
  }
  if (centerRow) {
    const dt = byId(centerRow.document_type_id);
    if (dt) return { documentType: dt, source: 'center', centerDocumentType };
  }
  if (centerDocumentType) {
    return { documentType: centerDocumentType, source: 'system', centerDocumentType };
  }
  return { documentType: null, source: 'none', centerDocumentType: null };
}

interface SetDocumentDefaultInput {
  audience: AiDocumentDefaultAudience;
  documentTypeId: string;
  /** 'center': fija la predeterminada de todo el centro (solo admin). 'mine': fija la
   *  override propia del profesional, que prevalece sobre la del centro solo para él. */
  scope: 'center' | 'mine';
}

/** Fija (crea o reemplaza) la predeterminada de un destinatario, de centro o propia. */
export function useSetDocumentDefault() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: SetDocumentDefaultInput) => {
      if (!profile?.center_id) throw new Error('No hay centro asignado');
      const professionalId = input.scope === 'mine' ? profile.id : null;

      let existingQuery = aiDb
        .from(AI_DOCUMENT_DEFAULTS_TABLE)
        .select('id')
        .eq('center_id', profile.center_id)
        .eq('audience', input.audience);
      existingQuery =
        professionalId === null
          ? existingQuery.is('professional_id', null)
          : existingQuery.eq('professional_id', professionalId);
      const { data: existing, error: findError } = await existingQuery.maybeSingle();
      if (findError) throw findError;

      if (existing) {
        const { error } = await aiDb
          .from(AI_DOCUMENT_DEFAULTS_TABLE)
          .update({
            document_type_id: input.documentTypeId,
            updated_at: new Date().toISOString(),
            updated_by: profile.id,
          })
          .eq('id', existing.id);
        if (error) throw error;
        return;
      }

      const { error } = await aiDb.from(AI_DOCUMENT_DEFAULTS_TABLE).insert({
        center_id: profile.center_id,
        professional_id: professionalId,
        audience: input.audience,
        document_type_id: input.documentTypeId,
        updated_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-defaults'] });
      toast.success('Predeterminada actualizada');
    },
    onError: (error) => {
      toast.error('Error al fijar la predeterminada');
      console.error(error);
    },
  });
}

/** Borra la override propia de un profesional para volver a usar la del centro. */
export function useClearOwnDocumentDefault() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (audience: AiDocumentDefaultAudience) => {
      if (!profile?.id || !profile?.center_id) throw new Error('No hay perfil');
      const { error } = await aiDb
        .from(AI_DOCUMENT_DEFAULTS_TABLE)
        .delete()
        .eq('center_id', profile.center_id)
        .eq('audience', audience)
        .eq('professional_id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-document-defaults'] });
      toast.success('Ahora se usará la predeterminada del centro');
    },
    onError: (error) => {
      toast.error('Error al quitar tu predeterminada');
      console.error(error);
    },
  });
}

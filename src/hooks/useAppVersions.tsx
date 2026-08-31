import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type { TablesUpdate } from '@/integrations/supabase/types';

export interface AppVersion {
  id: string;
  version_code: string;
  version_name: string | null;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  is_current: boolean;
  published_at: string | null;
  applies_to_verifactu: boolean;
  verifactu_synced_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  change_count?: number;
}

export interface AppChangeLog {
  id: string;
  title: string;
  description: string | null;
  module: string;
  change_type: 'feature' | 'improvement' | 'fix' | 'technical' | 'legal' | 'security' | 'ui';
  affects_verifactu: boolean;
  status: 'pending' | 'included' | 'archived';
  version_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useAppVersions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { center, updateCenter } = useCenter();
  const { logView } = useAuditLog();

  const versionsQuery = useQuery({
    queryKey: ['app-versions'],
    queryFn: async () => {
      const { data: versions, error } = await supabase
        .from('app_versions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Get change counts per version
      const { data: changeCounts, error: countError } = await supabase
        .from('app_change_log')
        .select('version_id')
        .eq('status', 'included');
      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      changeCounts?.forEach((c: { version_id: string | null }) => {
        if (c.version_id) {
          countMap[c.version_id] = (countMap[c.version_id] || 0) + 1;
        }
      });

      return (versions ?? []).map((v) => ({
        ...v,
        change_count: countMap[v.id] || 0,
      })) as AppVersion[];
    },
  });

  const pendingChangesQuery = useQuery({
    queryKey: ['app-changes-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_change_log')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AppChangeLog[];
    },
  });

  const getVersionChanges = async (versionId: string) => {
    const { data, error } = await supabase
      .from('app_change_log')
      .select('*')
      .eq('version_id', versionId)
      .eq('status', 'included')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as AppChangeLog[];
  };

  const createChange = useMutation({
    mutationFn: async (change: {
      title: string;
      description?: string;
      module: string;
      change_type: string;
      affects_verifactu: boolean;
    }) => {
      const { data, error } = await supabase
        .from('app_change_log')
        .insert({
          ...change,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      logView('app_change_log', data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-changes-pending'] });
      toast.success('Cambio registrado');
    },
    onError: () => toast.error('Error al registrar el cambio'),
  });

  const updateChange = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & TablesUpdate<'app_change_log'>) => {
      const { error } = await supabase
        .from('app_change_log')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-changes-pending'] });
      toast.success('Cambio actualizado');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const archiveChange = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_change_log')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-changes-pending'] });
      toast.success('Cambio archivado');
    },
    onError: () => toast.error('Error al archivar'),
  });

  const createVersion = useMutation({
    mutationFn: async ({
      version_code,
      version_name,
      description,
      applies_to_verifactu,
      changeIds,
    }: {
      version_code: string;
      version_name?: string;
      description?: string;
      applies_to_verifactu: boolean;
      changeIds: string[];
    }) => {
      const { data: version, error } = await supabase
        .from('app_versions')
        .insert({
          version_code,
          version_name: version_name || null,
          description: description || null,
          applies_to_verifactu,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Link changes to version
      if (changeIds.length > 0) {
        const { error: linkError } = await supabase
          .from('app_change_log')
          .update({ version_id: version.id, status: 'included' })
          .in('id', changeIds);
        if (linkError) throw linkError;
      }

      logView('app_versions', version.id);
      return version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      queryClient.invalidateQueries({ queryKey: ['app-changes-pending'] });
      toast.success('Versión creada');
    },
    onError: () => toast.error('Error al crear la versión'),
  });

  const publishVersion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_versions')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      logView('app_versions', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      toast.success('Versión publicada');
    },
    onError: () => toast.error('Error al publicar'),
  });

  const setAsCurrent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_versions')
        .update({ is_current: true })
        .eq('id', id);
      if (error) throw error;

      logView('app_versions', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      toast.success('Versión marcada como actual');
    },
    onError: () => toast.error('Error al marcar como actual'),
  });

  const syncWithVerifactu = useMutation({
    mutationFn: async ({ id, versionCode }: { id: string; versionCode: string }) => {
      // Update center's verifactu_software_version
      await updateCenter.mutateAsync({ verifactu_software_version: versionCode });

      // Mark version as synced
      const { error } = await supabase
        .from('app_versions')
        .update({ verifactu_synced_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      logView('app_versions', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      toast.success('Versión sincronizada con VeriFactu');
    },
    onError: () => toast.error('Error al sincronizar con VeriFactu'),
  });

  const archiveVersion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('app_versions')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      toast.success('Versión archivada');
    },
    onError: () => toast.error('Error al archivar'),
  });

  const currentVersion = versionsQuery.data?.find((v) => v.is_current) || null;

  return {
    versions: versionsQuery.data || [],
    pendingChanges: pendingChangesQuery.data || [],
    currentVersion,
    isLoading: versionsQuery.isLoading || pendingChangesQuery.isLoading,
    getVersionChanges,
    createChange,
    updateChange,
    archiveChange,
    createVersion,
    publishVersion,
    setAsCurrent,
    syncWithVerifactu,
    archiveVersion,
  };
}

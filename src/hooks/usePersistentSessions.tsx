import { useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessions, SessionWithRelations } from './useSessions';
import { useOfflineCache } from './useOfflineCache';
import { useNetworkStatus } from './useNetworkStatus';
import { useGoogleCalendarSync } from './useGoogleCalendarSync';
import { toast } from 'sonner';

interface UsePersistentSessionsOptions {
  startDate?: string;
  endDate?: string;
  professionalId?: string;
}

export function usePersistentSessions(options: UsePersistentSessionsOptions = {}) {
  const { startDate, endDate, professionalId } = options;
  const queryClient = useQueryClient();
  const networkStatus = useNetworkStatus();
  
  // Server data
  const {
    data: serverSessions,
    isLoading: isLoadingServer,
    error: serverError,
    refetch,
  } = useSessions(startDate, endDate, professionalId);

  // Local cache
  const {
    cachedSessions,
    pendingChanges,
    isInitialized: isCacheInitialized,
    cacheError,
    saveToCache,
    addPendingChange,
    removePendingChange,
    hasPendingChanges,
    getCacheStats,
  } = useOfflineCache();

  // Google Calendar sync
  const {
    sync: triggerGoogleSync,
    isSyncing: isGoogleSyncing,
    isAvailable: isGoogleSyncAvailable,
  } = useGoogleCalendarSync();

  // Merge server data with cache when server responds
  useEffect(() => {
    if (serverSessions && serverSessions.length > 0) {
      saveToCache(serverSessions);
    }
  }, [serverSessions, saveToCache]);

  // Determine which data to show
  const sessions = useMemo((): SessionWithRelations[] => {
    // If we have server data, prefer it
    if (serverSessions && serverSessions.length > 0) {
      return serverSessions;
    }
    
    // If offline or loading, show cached data
    if (!networkStatus.isOnline || isLoadingServer) {
      return cachedSessions;
    }
    
    // Server returned empty, show empty
    if (serverSessions && serverSessions.length === 0) {
      return [];
    }
    
    // Fallback to cache
    return cachedSessions;
  }, [serverSessions, cachedSessions, networkStatus.isOnline, isLoadingServer]);

  // Smart sync function with network awareness
  const syncWithGoogle = useCallback(async () => {
    if (!networkStatus.isOnline) {
      toast.error('Sin conexión a internet. La sincronización se realizará cuando vuelvas a estar online.');
      return { success: false, reason: 'offline' };
    }

    if (networkStatus.isSlowConnection) {
      toast.warning('Conexión lenta detectada. La sincronización puede tardar más de lo habitual.');
    }

    try {
      triggerGoogleSync();
      return { success: true };
    } catch (error) {
      console.error('[PersistentSessions] Sync error:', error);
      toast.error('Error al sincronizar con Google Calendar');
      return { success: false, reason: 'error' };
    }
  }, [networkStatus.isOnline, networkStatus.isSlowConnection, triggerGoogleSync]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (networkStatus.isOnline && networkStatus.lastOnlineAt && hasPendingChanges) {
      toast.info('Conexión restaurada. Sincronizando cambios pendientes...');
      // Trigger a refetch to sync with server
      refetch();
    }
  }, [networkStatus.isOnline, networkStatus.lastOnlineAt, hasPendingChanges, refetch]);

  // Notify user when going offline
  useEffect(() => {
    if (!networkStatus.isOnline && networkStatus.lastOfflineAt) {
      toast.warning('Sin conexión. Los cambios se guardarán localmente.');
    }
  }, [networkStatus.isOnline, networkStatus.lastOfflineAt]);

  // Computed states
  const isLoading = !isCacheInitialized || (isLoadingServer && cachedSessions.length === 0);
  const isUsingCache = !networkStatus.isOnline || (isLoadingServer && cachedSessions.length > 0);
  const canSync = networkStatus.isOnline && isGoogleSyncAvailable && !isGoogleSyncing;

  return {
    // Data
    sessions,
    
    // Loading states
    isLoading,
    isLoadingServer,
    isSyncing: isGoogleSyncing,
    
    // Network state
    isOnline: networkStatus.isOnline,
    isSlowConnection: networkStatus.isSlowConnection,
    isUsingCache,
    
    // Cache state
    hasPendingChanges,
    pendingChangesCount: pendingChanges.length,
    cacheError,
    cacheStats: getCacheStats(),
    
    // Actions
    syncWithGoogle,
    refetch,
    canSync,
    
    // Pending change management (for offline operations)
    addPendingChange,
    removePendingChange,
    
    // Errors
    serverError,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionWithRelations } from './useSessions';

const CACHE_KEY = 'psycma_sessions_cache';
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheData {
  version: number;
  timestamp: number;
  sessions: SessionWithRelations[];
  pendingChanges: PendingChange[];
}

interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  sessionId: string;
  data?: Partial<SessionWithRelations>;
  createdAt: number;
  retryCount: number;
}

interface UseOfflineCacheOptions {
  onCacheRestored?: (sessions: SessionWithRelations[]) => void;
  onPendingChangesRestored?: (changes: PendingChange[]) => void;
}

export function useOfflineCache(options: UseOfflineCacheOptions = {}) {
  const [cachedSessions, setCachedSessions] = useState<SessionWithRelations[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const lastSaveRef = useRef<number>(0);
  
  // Stabilize callbacks to prevent infinite loops
  const onCacheRestoredRef = useRef(options.onCacheRestored);
  const onPendingChangesRestoredRef = useRef(options.onPendingChangesRestored);
  
  useEffect(() => {
    onCacheRestoredRef.current = options.onCacheRestored;
    onPendingChangesRestoredRef.current = options.onPendingChangesRestored;
  }, [options.onCacheRestored, options.onPendingChangesRestored]);

  // Validate cache data integrity
  const validateCacheData = useCallback((data: unknown): data is CacheData => {
    if (!data || typeof data !== 'object') return false;
    
    const cache = data as CacheData;
    
    // Version check
    if (cache.version !== CACHE_VERSION) {
      console.warn('[OfflineCache] Version mismatch, clearing cache');
      return false;
    }
    
    // Age check
    if (Date.now() - cache.timestamp > CACHE_MAX_AGE_MS) {
      console.warn('[OfflineCache] Cache expired, clearing');
      return false;
    }
    
    // Structure validation
    if (!Array.isArray(cache.sessions)) {
      console.warn('[OfflineCache] Invalid sessions array');
      return false;
    }
    
    // Validate each session has required fields
    for (const session of cache.sessions) {
      if (!session.id || !session.session_date) {
        console.warn('[OfflineCache] Invalid session structure detected');
        return false;
      }
    }
    
    return true;
  }, []);

  // Load cache on mount with defensive parsing - runs only once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      
      if (!raw) {
        setIsInitialized(true);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        console.error('[OfflineCache] JSON parse error, clearing corrupted cache');
        localStorage.removeItem(CACHE_KEY);
        setCacheError('Caché corrupta, se ha reiniciado');
        setIsInitialized(true);
        return;
      }

      if (validateCacheData(parsed)) {
        setCachedSessions(parsed.sessions);
        setPendingChanges(parsed.pendingChanges || []);
        onCacheRestoredRef.current?.(parsed.sessions);
        onPendingChangesRestoredRef.current?.(parsed.pendingChanges || []);
        console.log(`[OfflineCache] Restored ${parsed.sessions.length} sessions from cache`);
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('[OfflineCache] Unexpected error loading cache:', error);
      setCacheError('Error al cargar caché local');
      setIsInitialized(true);
    }
  }, [validateCacheData]);

  // Save to cache with debouncing
  const saveToCache = useCallback((sessions: SessionWithRelations[], changes?: PendingChange[]) => {
    const now = Date.now();
    
    // Debounce: don't save more than once per second
    if (now - lastSaveRef.current < 1000) {
      return;
    }
    lastSaveRef.current = now;

    try {
      const cacheData: CacheData = {
        version: CACHE_VERSION,
        timestamp: now,
        sessions: sessions.map(s => ({
          ...s,
          // Strip large fields that don't need to be cached
          patient: s.patient ? {
            id: s.patient.id,
            first_name: s.patient.first_name,
            last_name: s.patient.last_name,
            email: s.patient.email,
            phone: s.patient.phone,
            auto_invoice_on_complete: s.patient.auto_invoice_on_complete ?? false,
            preferred_invoice_type: (s.patient.preferred_invoice_type as 'complete' | 'simplified') ?? 'simplified',
          } : null,
          professional: s.professional ? {
            id: s.professional.id,
            first_name: s.professional.first_name,
            last_name: s.professional.last_name,
          } : null,
        })),
        pendingChanges: changes || pendingChanges,
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      setCachedSessions(sessions);
      if (changes) setPendingChanges(changes);
      setCacheError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.error('[OfflineCache] Storage quota exceeded');
        setCacheError('Almacenamiento local lleno');
        // Try to clear old data
        clearOldCacheData();
      } else {
        console.error('[OfflineCache] Error saving to cache:', error);
        setCacheError('Error al guardar caché');
      }
    }
  }, [pendingChanges]);

  // Clear old/unnecessary cache data when quota is exceeded
  const clearOldCacheData = useCallback(() => {
    try {
      // Remove sessions older than 7 days from pending changes
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      setPendingChanges(prev => prev.filter(c => c.createdAt > oneWeekAgo));
    } catch (error) {
      console.error('[OfflineCache] Error clearing old data:', error);
    }
  }, []);

  // Add a pending change (for offline operations)
  const addPendingChange = useCallback((
    type: 'create' | 'update' | 'delete',
    sessionId: string,
    data?: Partial<SessionWithRelations>
  ) => {
    const change: PendingChange = {
      id: crypto.randomUUID(),
      type,
      sessionId,
      data,
      createdAt: Date.now(),
      retryCount: 0,
    };

    setPendingChanges(prev => {
      // Remove any existing pending change for the same session
      const filtered = prev.filter(c => c.sessionId !== sessionId);
      const updated = [...filtered, change];
      
      // Also save to localStorage immediately
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cache = JSON.parse(raw) as CacheData;
          cache.pendingChanges = updated;
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        }
      } catch (e) {
        console.error('[OfflineCache] Error saving pending change:', e);
      }
      
      return updated;
    });

    return change;
  }, []);

  // Remove a pending change after successful sync
  const removePendingChange = useCallback((changeId: string) => {
    setPendingChanges(prev => {
      const updated = prev.filter(c => c.id !== changeId);
      
      // Also update localStorage
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cache = JSON.parse(raw) as CacheData;
          cache.pendingChanges = updated;
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        }
      } catch (e) {
        console.error('[OfflineCache] Error removing pending change:', e);
      }
      
      return updated;
    });
  }, []);

  // Clear all cache
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
      setCachedSessions([]);
      setPendingChanges([]);
      setCacheError(null);
    } catch (error) {
      console.error('[OfflineCache] Error clearing cache:', error);
    }
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      
      const sizeBytes = new Blob([raw]).size;
      const cache = JSON.parse(raw) as CacheData;
      
      return {
        sessionCount: cache.sessions.length,
        pendingChangesCount: cache.pendingChanges?.length || 0,
        sizeKB: Math.round(sizeBytes / 1024),
        lastUpdated: new Date(cache.timestamp),
      };
    } catch {
      return null;
    }
  }, []);

  return {
    cachedSessions,
    pendingChanges,
    isInitialized,
    cacheError,
    saveToCache,
    addPendingChange,
    removePendingChange,
    clearCache,
    getCacheStats,
    hasPendingChanges: pendingChanges.length > 0,
  };
}

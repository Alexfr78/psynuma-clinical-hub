import { useState, useEffect, useCallback } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType: string | null;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSlowConnection: false,
    connectionType: null,
    lastOnlineAt: null,
    lastOfflineAt: null,
  }));

  const updateNetworkInfo = useCallback(() => {
    const connection = (navigator as any).connection || 
                       (navigator as any).mozConnection || 
                       (navigator as any).webkitConnection;

    const isSlowConnection = connection ? 
      connection.effectiveType === 'slow-2g' || 
      connection.effectiveType === '2g' ||
      connection.saveData === true : false;

    setStatus(prev => ({
      ...prev,
      isSlowConnection,
      connectionType: connection?.effectiveType || null,
    }));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({
        ...prev,
        isOnline: true,
        lastOnlineAt: new Date(),
      }));
      updateNetworkInfo();
    };

    const handleOffline = () => {
      setStatus(prev => ({
        ...prev,
        isOnline: false,
        lastOfflineAt: new Date(),
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', updateNetworkInfo);
    }

    // Initial check
    updateNetworkInfo();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', updateNetworkInfo);
      }
    };
  }, [updateNetworkInfo]);

  return status;
}

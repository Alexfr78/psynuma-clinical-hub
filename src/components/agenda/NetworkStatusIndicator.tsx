import { Wifi } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

interface NetworkStatusIndicatorProps {
  isOnline: boolean;
  isSlowConnection: boolean;
  isUsingCache: boolean;
  hasPendingChanges: boolean;
  pendingChangesCount: number;
  isSyncing: boolean;
  canSync: boolean;
  onSync: () => void;
  cacheError?: string | null;
}

export function NetworkStatusIndicator({
  isOnline,
  isSlowConnection,
  isUsingCache,
  hasPendingChanges,
  pendingChangesCount,
  isSyncing,
  canSync,
  onSync,
  cacheError,
}: NetworkStatusIndicatorProps) {
  // Don't show anything if everything is normal
  if (isOnline && !isUsingCache && !hasPendingChanges && !cacheError && !isSlowConnection) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Offline indicator */}
      {!isOnline && (
        <Badge variant="destructive" className="gap-1">
          <Icon name="wifi_off" className="h-3 w-3" />
          Sin conexión
        </Badge>
      )}

      {/* Slow connection warning */}
      {isOnline && isSlowConnection && (
        <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Icon name="warning" className="h-3 w-3" />
          Conexión lenta
        </Badge>
      )}

      {/* Using cache indicator */}
      {isUsingCache && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1">
              <Icon name="cloud_off" className="h-3 w-3" />
              Modo offline
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Mostrando datos almacenados localmente
          </TooltipContent>
        </Tooltip>
      )}

      {/* Pending changes badge */}
      {hasPendingChanges && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1">
              {pendingChangesCount} cambio{pendingChangesCount !== 1 ? 's' : ''} pendiente{pendingChangesCount !== 1 ? 's' : ''}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Se sincronizarán cuando vuelvas a estar online
          </TooltipContent>
        </Tooltip>
      )}

      {/* Cache error */}
      {cacheError && (
        <Badge variant="destructive" className="gap-1">
          <Icon name="warning" className="h-3 w-3" />
          {cacheError}
        </Badge>
      )}

      {/* Sync button */}
      {isOnline && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSync}
              disabled={!canSync}
              className={cn(
                "h-7 px-2",
                hasPendingChanges && "text-primary"
              )}
            >
              <Icon name="refresh" className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isSyncing ? 'Sincronizando...' : 
             !canSync ? 'Sincronización no disponible' : 
             'Sincronizar con Google Calendar'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

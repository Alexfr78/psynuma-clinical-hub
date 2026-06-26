import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Module-level debounce map: key -> timestamp of last log
const lastLogTimes = new Map<string, number>();
const DEBOUNCE_MS = 60_000; // 60 seconds

type ClientAuditRpc = (
  fn: 'record_client_audit_event',
  args: {
    p_resource_type: string;
    p_resource_id: string;
    p_patient_id?: string | null;
    p_action: 'VIEW';
    p_route_or_endpoint: string;
    p_user_agent: string;
    p_metadata: Record<string, never>;
  }
) => Promise<{ error: Error | null }>;

export function useAuditLog() {
  const logView = useCallback(
    (resourceType: string, resourceId: string, patientId?: string) => {
      const key = `${resourceType}:${resourceId}`;
      const now = Date.now();
      const last = lastLogTimes.get(key);
      if (last && now - last < DEBOUNCE_MS) return;
      lastLogTimes.set(key, now);

      // Fire-and-forget
      (async () => {
        try {
          const rpc = supabase.rpc as unknown as ClientAuditRpc;
          await rpc('record_client_audit_event', {
            p_patient_id: patientId ?? null,
            p_resource_type: resourceType,
            p_resource_id: resourceId,
            p_action: 'VIEW',
            p_user_agent: navigator.userAgent,
            p_route_or_endpoint: window.location.pathname,
            p_metadata: {},
          });
        } catch {
          // Never propagate errors
        }
      })();
    },
    []
  );

  return { logView };
}

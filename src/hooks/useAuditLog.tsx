import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Module-level debounce map: key -> timestamp of last log
const lastLogTimes = new Map<string, number>();
const DEBOUNCE_MS = 60_000; // 60 seconds

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
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          await supabase.rpc('record_audit_event', {
            p_user_id: user.id,
            p_user_role: null,
            p_organization_id: null,
            p_patient_id: patientId ?? null,
            p_resource_type: resourceType,
            p_resource_id: resourceId,
            p_action: 'VIEW',
            p_status: 'success',
            p_ip_address: null,
            p_user_agent: navigator.userAgent,
            p_session_id: null,
            p_request_method: 'GET',
            p_route_or_endpoint: window.location.pathname,
            p_justification: null,
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

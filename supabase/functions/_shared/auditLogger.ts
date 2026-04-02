import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AuditAction =
  | 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'EXPORT' | 'DOWNLOAD' | 'LOGIN' | 'LOGOUT'
  | 'ACCESS_DENIED' | 'SHARE' | 'PRINT';

export type AuditResourceType =
  | 'patients' | 'sessions' | 'assessments' | 'consents'
  | 'invoices' | 'autoregistro_entries' | 'autoregistro_templates'
  | 'documents' | 'reports' | 'clinical_notes';

export interface AuditEventParams {
  supabase: SupabaseClient;
  req: Request;
  userId: string | null;
  userRole?: string | null;
  organizationId?: string | null;
  patientId?: string | null;
  resourceType: AuditResourceType | string;
  resourceId?: string | null;
  action: AuditAction | string;
  status?: 'success' | 'denied' | 'failed';
  justification?: string | null;
  metadata?: Record<string, unknown>;
  routeOrEndpoint?: string;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    supabase, req, userId, userRole, organizationId, patientId,
    resourceType, resourceId, action, status = 'success',
    justification, metadata = {}, routeOrEndpoint,
  } = params;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const userAgent = req.headers.get('user-agent') || null;

  try {
    await supabase.rpc('record_audit_event', {
      p_user_id: userId,
      p_user_role: userRole ?? null,
      p_organization_id: organizationId ?? null,
      p_patient_id: patientId ?? null,
      p_resource_type: resourceType,
      p_resource_id: resourceId ?? null,
      p_action: action,
      p_status: status,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_session_id: null,
      p_request_method: req.method,
      p_route_or_endpoint: routeOrEndpoint ?? new URL(req.url).pathname,
      p_justification: justification ?? null,
      p_metadata: metadata,
    });
  } catch (err) {
    // Audit failures must never break the main operation
    console.error('[auditLogger] Failed to record audit event:', err);
  }
}

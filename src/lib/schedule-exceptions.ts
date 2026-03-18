import { format } from 'date-fns';

export interface ScheduleException {
  id: string;
  center_id: string;
  professional_id: string | null;
  scope: 'center' | 'professional';
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason_type: 'holiday' | 'vacation' | 'sick_leave' | 'training' | 'closure' | 'other';
  reason_label: string | null;
  notes: string | null;
  affects_booking: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const REASON_LABELS: Record<string, string> = {
  holiday: 'Festivo',
  vacation: 'Vacaciones',
  sick_leave: 'Baja médica',
  training: 'Formación',
  closure: 'Cierre',
  other: 'No disponible',
};

export function getReasonLabel(reasonType: string, reasonLabel?: string | null): string {
  return reasonLabel || REASON_LABELS[reasonType] || 'No disponible';
}

export interface BlockedResult {
  blocked: true;
  reason: string;
  scope: 'center' | 'professional';
  exception: ScheduleException;
}

/**
 * Check if a given date+time is blocked by any schedule exception.
 * Returns the first matching block or null if not blocked.
 */
export function isDateBlocked(
  date: string, // yyyy-MM-dd
  startTime: string | null,
  endTime: string | null,
  professionalId: string | null,
  exceptions: ScheduleException[]
): BlockedResult | null {
  for (const exc of exceptions) {
    if (!exc.affects_booking) continue;

    // Check date range
    if (date < exc.start_date || date > exc.end_date) continue;

    // Check scope: center exceptions block everyone, professional only the specific one
    if (exc.scope === 'professional' && exc.professional_id !== professionalId) continue;

    // If all_day, it's blocked
    if (exc.all_day) {
      return {
        blocked: true,
        reason: getReasonLabel(exc.reason_type, exc.reason_label),
        scope: exc.scope,
        exception: exc,
      };
    }

    // Partial day: check time overlap
    if (exc.start_time && exc.end_time && startTime && endTime) {
      const excStart = exc.start_time.slice(0, 5);
      const excEnd = exc.end_time.slice(0, 5);
      if (startTime < excEnd && endTime > excStart) {
        return {
          blocked: true,
          reason: getReasonLabel(exc.reason_type, exc.reason_label),
          scope: exc.scope,
          exception: exc,
        };
      }
    }
  }

  return null;
}

/**
 * Get all exceptions that affect a specific date (for visual indicators).
 */
export function getExceptionsForDate(
  date: string,
  professionalId: string | null,
  exceptions: ScheduleException[]
): ScheduleException[] {
  return exceptions.filter((exc) => {
    if (date < exc.start_date || date > exc.end_date) return false;
    if (exc.scope === 'professional' && exc.professional_id !== professionalId) return false;
    return true;
  });
}

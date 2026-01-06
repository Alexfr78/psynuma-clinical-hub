import { supabase } from '@/integrations/supabase/client';

export interface SessionToCheck {
  start: Date;
  end: Date;
  tempId?: string;
}

export interface ConflictInfo {
  id: string;
  start: string;
  end: string;
  patientName?: string;
  sessionDate: string;
}

export interface ConflictResult {
  tempId?: string;
  start: Date;
  end: Date;
  conflicts: ConflictInfo[];
}

/**
 * Check for session conflicts (overlapping sessions) for a professional
 */
export async function checkSessionConflicts(params: {
  centerId: string;
  professionalId: string;
  sessionsToCheck: SessionToCheck[];
  excludeSessionId?: string;
}): Promise<ConflictResult[]> {
  const { centerId, professionalId, sessionsToCheck, excludeSessionId } = params;

  if (sessionsToCheck.length === 0) {
    return [];
  }

  // Calculate global min/max range for efficient query
  const allStarts = sessionsToCheck.map(s => s.start.getTime());
  const allEnds = sessionsToCheck.map(s => s.end.getTime());
  const minStart = new Date(Math.min(...allStarts));
  const maxEnd = new Date(Math.max(...allEnds));

  // Add buffer for timezone safety
  const queryStartDate = new Date(minStart);
  queryStartDate.setDate(queryStartDate.getDate() - 1);
  const queryEndDate = new Date(maxEnd);
  queryEndDate.setDate(queryEndDate.getDate() + 1);

  // Format dates for query
  const startDateStr = queryStartDate.toISOString().split('T')[0];
  const endDateStr = queryEndDate.toISOString().split('T')[0];

  // Query existing sessions in the range
  let query = supabase
    .from('sessions')
    .select(`
      id,
      session_date,
      start_time,
      end_time,
      patient:patients!sessions_patient_id_fkey(
        first_name,
        last_name
      )
    `)
    .eq('center_id', centerId)
    .eq('professional_id', professionalId)
    .gte('session_date', startDateStr)
    .lte('session_date', endDateStr)
    .neq('status', 'cancelled');

  if (excludeSessionId) {
    query = query.neq('id', excludeSessionId);
  }

  const { data: existingSessions, error } = await query;

  if (error) {
    console.error('Error checking conflicts:', error);
    throw error;
  }

  if (!existingSessions || existingSessions.length === 0) {
    return [];
  }

  // Convert existing sessions to Date objects for comparison
  const existingWithDates = existingSessions.map(session => {
    const startDateTime = new Date(`${session.session_date}T${session.start_time}`);
    const endDateTime = new Date(`${session.session_date}T${session.end_time}`);
    
    const patient = session.patient as { first_name: string; last_name: string } | null;
    const patientName = patient
      ? `${patient.first_name} ${patient.last_name}`
      : undefined;

    return {
      id: session.id,
      start: startDateTime,
      end: endDateTime,
      patientName,
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
    };
  });

  // Check each session for conflicts
  const results: ConflictResult[] = [];

  for (const sessionToCheck of sessionsToCheck) {
    const conflicts: ConflictInfo[] = [];

    for (const existing of existingWithDates) {
      // Overlap: newStart < existingEnd AND newEnd > existingStart
      if (
        sessionToCheck.start < existing.end &&
        sessionToCheck.end > existing.start
      ) {
        conflicts.push({
          id: existing.id,
          start: existing.startTime,
          end: existing.endTime,
          patientName: existing.patientName,
          sessionDate: existing.sessionDate,
        });
      }
    }

    if (conflicts.length > 0) {
      results.push({
        tempId: sessionToCheck.tempId,
        start: sessionToCheck.start,
        end: sessionToCheck.end,
        conflicts,
      });
    }
  }

  return results;
}

/**
 * Format conflict results for display
 */
export function formatConflictMessage(conflicts: ConflictResult[]): string {
  if (conflicts.length === 0) return '';

  const lines = conflicts.map(c => {
    const dateStr = c.start.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timeStr = c.start.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const conflictDetails = c.conflicts
      .map(conf => {
        const patient = conf.patientName || 'Cita existente';
        return `  - ${conf.start.slice(0, 5)}-${conf.end.slice(0, 5)}: ${patient}`;
      })
      .join('\n');

    return `${dateStr} ${timeStr}:\n${conflictDetails}`;
  });

  return lines.join('\n\n');
}

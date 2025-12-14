import { SessionWithRelations } from '@/hooks/useSessions';

interface SessionPosition {
  left: number; // percentage
  width: number; // percentage
  column: number;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function sessionsOverlap(a: SessionWithRelations, b: SessionWithRelations): boolean {
  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time);
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time);
  
  // Sessions overlap if one starts before the other ends
  return aStart < bEnd && bStart < aEnd;
}

export function calculateSessionPositions(sessions: SessionWithRelations[]): Map<string, SessionPosition> {
  if (sessions.length === 0) {
    return new Map();
  }

  // Sort by start time, then by end time (longer sessions first)
  const sorted = [...sessions].sort((a, b) => {
    const startDiff = timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (startDiff !== 0) return startDiff;
    // If same start, put longer sessions first
    return timeToMinutes(b.end_time) - timeToMinutes(a.end_time);
  });

  // Group overlapping sessions
  const groups: SessionWithRelations[][] = [];
  
  for (const session of sorted) {
    // Find a group where this session overlaps with at least one session
    let addedToGroup = false;
    
    for (const group of groups) {
      const overlapsWithGroup = group.some(s => sessionsOverlap(s, session));
      if (overlapsWithGroup) {
        group.push(session);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([session]);
    }
  }

  // Merge overlapping groups
  const mergedGroups: SessionWithRelations[][] = [];
  
  for (const group of groups) {
    let merged = false;
    for (const existingGroup of mergedGroups) {
      // Check if any session in group overlaps with any session in existingGroup
      const shouldMerge = group.some(s1 => 
        existingGroup.some(s2 => sessionsOverlap(s1, s2))
      );
      if (shouldMerge) {
        existingGroup.push(...group);
        merged = true;
        break;
      }
    }
    if (!merged) {
      mergedGroups.push([...group]);
    }
  }

  const positions = new Map<string, SessionPosition>();

  // Process each group of overlapping sessions
  for (const group of mergedGroups) {
    if (group.length === 1) {
      // Single session takes full width
      positions.set(group[0].id, { left: 0, width: 100, column: 0 });
      continue;
    }

    // Assign columns to sessions in the group
    const columns: SessionWithRelations[][] = [];
    
    // Sort group by start time again
    group.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    
    for (const session of group) {
      // Find first column where this session doesn't overlap with existing sessions
      let placed = false;
      
      for (let i = 0; i < columns.length; i++) {
        const lastInColumn = columns[i][columns[i].length - 1];
        if (!sessionsOverlap(lastInColumn, session)) {
          columns[i].push(session);
          placed = true;
          const totalColumns = Math.max(columns.length, i + 1);
          positions.set(session.id, {
            column: i,
            left: (i / totalColumns) * 100,
            width: 100 / totalColumns,
          });
          break;
        }
      }
      
      if (!placed) {
        columns.push([session]);
        const colIndex = columns.length - 1;
        positions.set(session.id, {
          column: colIndex,
          left: 0, // Will be recalculated
          width: 100, // Will be recalculated
        });
      }
    }

    // Recalculate all positions in this group with correct total columns
    const totalColumns = columns.length;
    columns.forEach((col, colIndex) => {
      col.forEach(session => {
        positions.set(session.id, {
          column: colIndex,
          left: (colIndex / totalColumns) * 100,
          width: 100 / totalColumns,
        });
      });
    });
  }

  return positions;
}

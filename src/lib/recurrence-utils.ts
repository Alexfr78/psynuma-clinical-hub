/**
 * Recurrence Utilities for Recurring Appointments
 * Handles date generation for DAILY, WEEKLY, and MONTHLY patterns
 */

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type RecurrenceEndType = 'count' | 'until_date';

export interface RecurrenceConfig {
  freq: RecurrenceFrequency;
  interval: number;
  byweekday?: string[]; // ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  end_type: RecurrenceEndType;
  count?: number;
  until_date?: string; // ISO date string YYYY-MM-DD
}

// Map weekday codes to JS day numbers (0 = Sunday, 1 = Monday, etc.)
const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const WEEKDAY_LABELS: Record<string, string> = {
  MO: 'L',
  TU: 'M',
  WE: 'X',
  TH: 'J',
  FR: 'V',
  SA: 'S',
  SU: 'D',
};

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export function getWeekdayLabel(code: string): string {
  return WEEKDAY_LABELS[code] || code;
}

/**
 * Get the last day of a given month
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date, handling edge cases for day overflow
 */
function addMonths(date: Date, months: number, originalDay: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  
  // Handle cases where the target month doesn't have the original day
  // e.g., Jan 31 + 1 month should be Feb 28/29, not Mar 3
  const lastDay = getLastDayOfMonth(result.getFullYear(), result.getMonth());
  if (originalDay > lastDay) {
    result.setDate(lastDay);
  } else {
    result.setDate(originalDay);
  }
  
  return result;
}

/**
 * Check if a date matches any of the specified weekdays
 */
function matchesWeekday(date: Date, byweekday: string[]): boolean {
  const dayNum = date.getDay();
  return byweekday.some(wd => WEEKDAY_MAP[wd] === dayNum);
}

/**
 * Generate occurrence dates based on recurrence configuration
 * 
 * @param config - Recurrence configuration
 * @param startDate - The first occurrence date
 * @param maxOccurrences - Maximum number of occurrences to generate (safety limit)
 * @param maxDays - Maximum days into the future (safety limit)
 * @returns Array of Date objects for each occurrence
 */
export function generateOccurrences(
  config: RecurrenceConfig,
  startDate: Date,
  maxOccurrences: number = 50,
  maxDays: number = 365
): Date[] {
  const occurrences: Date[] = [];
  const endLimit = addDays(startDate, maxDays);
  const originalDay = startDate.getDate();
  
  // Determine max count based on config
  let targetCount = maxOccurrences;
  if (config.end_type === 'count' && config.count) {
    targetCount = Math.min(config.count, maxOccurrences);
  }
  
  // Determine end date limit
  let endDate = endLimit;
  if (config.end_type === 'until_date' && config.until_date) {
    const untilDate = new Date(config.until_date);
    untilDate.setHours(23, 59, 59, 999); // Include the entire day
    endDate = untilDate < endLimit ? untilDate : endLimit;
  }
  
  let currentDate = new Date(startDate);
  let count = 0;
  
  switch (config.freq) {
    case 'DAILY':
      while (count < targetCount && currentDate <= endDate) {
        occurrences.push(new Date(currentDate));
        count++;
        currentDate = addDays(currentDate, config.interval);
      }
      break;
      
    case 'WEEKLY':
      // For weekly, we need to generate for each selected weekday
      if (!config.byweekday || config.byweekday.length === 0) {
        // Default to same day of week as start date
        const startDayNum = startDate.getDay();
        const startDayCode = Object.entries(WEEKDAY_MAP).find(([_, num]) => num === startDayNum)?.[0] || 'MO';
        config.byweekday = [startDayCode];
      }
      
      // Sort weekdays by their numeric value starting from start date's day
      const sortedWeekdays = [...config.byweekday].sort((a, b) => WEEKDAY_MAP[a] - WEEKDAY_MAP[b]);
      
      // Start from the beginning of the week containing startDate
      let weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Move to Sunday
      
      let weekIndex = 0;
      
      while (count < targetCount && weekStart <= endDate) {
        for (const dayCode of sortedWeekdays) {
          if (count >= targetCount) break;
          
          const dayNum = WEEKDAY_MAP[dayCode];
          const occurrenceDate = new Date(weekStart);
          occurrenceDate.setDate(occurrenceDate.getDate() + dayNum);
          
          // Copy time from startDate
          occurrenceDate.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
          
          // Only include if on or after startDate and on or before endDate
          if (occurrenceDate >= startDate && occurrenceDate <= endDate) {
            occurrences.push(new Date(occurrenceDate));
            count++;
          }
        }
        
        weekIndex++;
        // Move to next week(s) based on interval
        if (weekIndex % config.interval === 0) {
          weekStart = addDays(weekStart, 7 * config.interval);
        } else {
          weekStart = addDays(weekStart, 7);
        }
        
        // Simplified: just move by interval weeks
        weekStart = addDays(new Date(startDate), 7 * config.interval * Math.floor((count > 0 ? count : 1) / sortedWeekdays.length));
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Move to Sunday
        
        // Prevent infinite loop
        if (weekStart > addDays(endDate, 7)) break;
      }
      
      // Re-sort by date and remove duplicates
      const uniqueDates = [...new Map(occurrences.map(d => [d.getTime(), d])).values()];
      occurrences.length = 0;
      occurrences.push(...uniqueDates.sort((a, b) => a.getTime() - b.getTime()).slice(0, targetCount));
      break;
      
    case 'MONTHLY':
      while (count < targetCount && currentDate <= endDate) {
        occurrences.push(new Date(currentDate));
        count++;
        currentDate = addMonths(currentDate, config.interval, originalDay);
      }
      break;
  }
  
  return occurrences;
}

/**
 * Simplified weekly generation - more reliable
 */
export function generateWeeklyOccurrences(
  startDate: Date,
  interval: number,
  byweekday: string[],
  targetCount: number,
  endDate: Date
): Date[] {
  const occurrences: Date[] = [];
  const sortedDays = byweekday
    .map(d => WEEKDAY_MAP[d])
    .filter(n => n !== undefined)
    .sort((a, b) => a - b);
  
  if (sortedDays.length === 0) return occurrences;
  
  let currentWeekStart = new Date(startDate);
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  
  let count = 0;
  let weeksProcessed = 0;
  
  while (count < targetCount && weeksProcessed < 200) { // Safety limit
    if (currentWeekStart > endDate) break; // Early exit if past end date
    for (const dayNum of sortedDays) {
      if (count >= targetCount) break;
      
      const occDate = new Date(currentWeekStart);
      occDate.setDate(occDate.getDate() + dayNum);
      occDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      
      if (occDate >= startDate && occDate <= endDate) {
        occurrences.push(occDate);
        count++;
      }
    }
    
    weeksProcessed++;
    currentWeekStart.setDate(currentWeekStart.getDate() + 7 * interval);
  }
  
  return occurrences;
}

/**
 * Generate occurrences with proper handling for all frequencies
 */
export function generateRecurrenceOccurrences(
  config: RecurrenceConfig,
  startDate: Date,
  maxOccurrences: number = 50,
  maxDays: number = 365
): Date[] {
  const endLimit = addDays(startDate, maxDays);
  const originalDay = startDate.getDate();
  
  let targetCount = maxOccurrences;
  if (config.end_type === 'count' && config.count) {
    targetCount = Math.min(config.count, maxOccurrences);
  }
  
  let endDate = endLimit;
  if (config.end_type === 'until_date' && config.until_date) {
    const untilDate = new Date(config.until_date);
    untilDate.setHours(23, 59, 59, 999);
    endDate = untilDate < endLimit ? untilDate : endLimit;
  }
  
  if (config.freq === 'WEEKLY') {
    const byweekday = config.byweekday && config.byweekday.length > 0 
      ? config.byweekday 
      : [Object.entries(WEEKDAY_MAP).find(([_, n]) => n === startDate.getDay())?.[0] || 'MO'];
    
    return generateWeeklyOccurrences(startDate, config.interval, byweekday, targetCount, endDate);
  }
  
  const occurrences: Date[] = [];
  let currentDate = new Date(startDate);
  let count = 0;
  
  while (count < targetCount && currentDate <= endDate) {
    occurrences.push(new Date(currentDate));
    count++;
    
    if (config.freq === 'DAILY') {
      currentDate = addDays(currentDate, config.interval);
    } else if (config.freq === 'MONTHLY') {
      currentDate = addMonths(currentDate, config.interval, originalDay);
    }
  }
  
  return occurrences;
}

/**
 * Calculate the number of occurrences that will be generated
 */
export function calculateOccurrenceCount(
  config: RecurrenceConfig,
  startDate: Date,
  maxOccurrences: number = 50,
  maxDays: number = 365
): { count: number; endDate: Date | null } {
  const occurrences = generateRecurrenceOccurrences(config, startDate, maxOccurrences, maxDays);
  return {
    count: occurrences.length,
    endDate: occurrences.length > 0 ? occurrences[occurrences.length - 1] : null,
  };
}

/**
 * Format a recurrence config into a human-readable Spanish string
 */
export function formatRecurrenceDescription(config: RecurrenceConfig): string {
  const freqLabels: Record<RecurrenceFrequency, string> = {
    DAILY: 'día',
    WEEKLY: 'semana',
    MONTHLY: 'mes',
  };
  
  let desc = `Cada ${config.interval} ${freqLabels[config.freq]}${config.interval > 1 ? (config.freq === 'MONTHLY' ? 'es' : 's') : ''}`;
  
  if (config.freq === 'WEEKLY' && config.byweekday && config.byweekday.length > 0) {
    const dayLabels = config.byweekday.map(d => getWeekdayLabel(d)).join(', ');
    desc += ` los ${dayLabels}`;
  }
  
  return desc;
}

/**
 * Check if a date might have issues (e.g., 31st on a short month)
 */
export function hasMonthlyDateWarning(startDate: Date): boolean {
  const day = startDate.getDate();
  return day > 28;
}

/**
 * Get warning message for monthly recurrence on days > 28
 */
export function getMonthlyWarning(startDate: Date): string | null {
  const day = startDate.getDate();
  if (day <= 28) return null;
  
  if (day === 31) {
    return 'En meses sin día 31, la cita se programará en el último día del mes.';
  }
  if (day === 30) {
    return 'En febrero, la cita se programará en el último día del mes.';
  }
  if (day === 29) {
    return 'En febrero (años no bisiestos), la cita se programará el día 28.';
  }
  
  return null;
}

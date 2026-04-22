import { useMemo } from 'react';
import { getDay } from 'date-fns';
import { useLocations } from './useLocations';
import { useAllLocationSchedules } from './useLocationSchedules';
import { useProfessionals, useAllProfessionalAvailability } from './useProfessionals';
import { SessionWithRelations } from './useSessions';

interface AgendaHoursConfig {
  startHour: number;
  endHour: number;
  hours: number[];
}

const DEFAULT_START = 8;
const DEFAULT_END = 20;

function timeToHour(time: string): number {
  const [hours] = time.split(':').map(Number);
  return hours;
}

function timeToEndHour(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  // Round up if there are minutes
  return minutes > 0 ? hours + 1 : hours;
}

export function useAgendaHours(
  selectedProfessionalId: string,
  currentDate: Date,
  sessions?: SessionWithRelations[]
): AgendaHoursConfig {
  const { data: locations } = useLocations();
  const { data: professionals } = useProfessionals();
  
  const locationIds = useMemo(() => 
    locations?.map(l => l.id) || [], 
    [locations]
  );
  
  const professionalIds = useMemo(() => 
    professionals?.map(p => p.id) || [], 
    [professionals]
  );

  const { data: locationSchedules } = useAllLocationSchedules(locationIds);
  const { data: professionalAvailability } = useAllProfessionalAvailability(professionalIds);

  const config = useMemo((): AgendaHoursConfig => {
    const dayOfWeek = getDay(currentDate); // 0 = Sunday, 1 = Monday, etc.

    // Compute session-driven range (priority when there are sessions)
    let sessionMin = 24;
    let sessionMax = 0;
    let hasSessions = false;
    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        const sH = timeToHour(session.start_time);
        const eH = timeToEndHour(session.end_time);
        if (sH < sessionMin) sessionMin = sH;
        if (eH > sessionMax) sessionMax = eH;
        hasSessions = true;
      });
    }

    // Compute configured range from availability/location schedules
    let configMin = DEFAULT_END;
    let configMax = DEFAULT_START;
    let hasConfig = false;

    if (selectedProfessionalId && selectedProfessionalId !== 'all') {
      const profAvailability = professionalAvailability?.filter(
        a => a.professional_id === selectedProfessionalId && a.is_available
      );
      if (profAvailability && profAvailability.length > 0) {
        profAvailability.forEach(slot => {
          const sH = timeToHour(slot.start_time);
          const eH = timeToHour(slot.end_time);
          if (sH < configMin) configMin = sH;
          if (eH > configMax) configMax = eH;
          hasConfig = true;
        });
      }
    } else {
      const daySchedules = locationSchedules?.filter(
        s => s.day_of_week === dayOfWeek && s.is_open
      );
      if (daySchedules && daySchedules.length > 0) {
        daySchedules.forEach(schedule => {
          const sH = timeToHour(schedule.start_time);
          const eH = timeToHour(schedule.end_time);
          if (sH < configMin) configMin = sH;
          if (eH > configMax) configMax = eH;
          hasConfig = true;
        });
      }
      if (professionalAvailability && professionalAvailability.length > 0) {
        professionalAvailability
          .filter(a => a.is_available)
          .forEach(slot => {
            const sH = timeToHour(slot.start_time);
            const eH = timeToHour(slot.end_time);
            if (sH < configMin) configMin = sH;
            if (eH > configMax) configMax = eH;
            hasConfig = true;
          });
      }
    }

    let minStart: number;
    let maxEnd: number;

    if (hasSessions) {
      // Center the view around the actual sessions with a 1h margin on each side.
      // Don't expand all the way to availability bounds when there are no sessions there.
      minStart = Math.max(0, sessionMin - 1);
      maxEnd = Math.min(24, sessionMax + 1);
    } else if (hasConfig) {
      minStart = configMin;
      maxEnd = configMax;
    } else {
      minStart = DEFAULT_START;
      maxEnd = DEFAULT_END;
    }

    // Ensure valid range
    if (minStart >= maxEnd) {
      minStart = DEFAULT_START;
      maxEnd = DEFAULT_END;
    }

    // Generate hours array
    const hours = Array.from(
      { length: maxEnd - minStart },
      (_, i) => minStart + i
    );

    return {
      startHour: minStart,
      endHour: maxEnd,
      hours,
    };
  }, [selectedProfessionalId, currentDate, locationSchedules, professionalAvailability, sessions]);

  return config;
}

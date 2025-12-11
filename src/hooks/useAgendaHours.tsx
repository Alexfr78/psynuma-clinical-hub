import { useMemo } from 'react';
import { getDay } from 'date-fns';
import { useLocations } from './useLocations';
import { useAllLocationSchedules } from './useLocationSchedules';
import { useProfessionals, useAllProfessionalAvailability } from './useProfessionals';

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

export function useAgendaHours(
  selectedProfessionalId: string,
  currentDate: Date
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
    
    let minStart = DEFAULT_END;
    let maxEnd = DEFAULT_START;
    let hasConfig = false;

    // If a specific professional is selected, only use their availability
    if (selectedProfessionalId && selectedProfessionalId !== 'all') {
      const profAvailability = professionalAvailability?.filter(
        a => a.professional_id === selectedProfessionalId && a.is_available
      );

      if (profAvailability && profAvailability.length > 0) {
        profAvailability.forEach(slot => {
          const startH = timeToHour(slot.start_time);
          const endH = timeToHour(slot.end_time);
          if (startH < minStart) minStart = startH;
          if (endH > maxEnd) maxEnd = endH;
          hasConfig = true;
        });
      }
    } else {
      // Use location schedules for the specific day
      const daySchedules = locationSchedules?.filter(
        s => s.day_of_week === dayOfWeek && s.is_open
      );

      if (daySchedules && daySchedules.length > 0) {
        daySchedules.forEach(schedule => {
          const startH = timeToHour(schedule.start_time);
          const endH = timeToHour(schedule.end_time);
          if (startH < minStart) minStart = startH;
          if (endH > maxEnd) maxEnd = endH;
          hasConfig = true;
        });
      }

      // Also consider all professional availability
      if (professionalAvailability && professionalAvailability.length > 0) {
        professionalAvailability
          .filter(a => a.is_available)
          .forEach(slot => {
            const startH = timeToHour(slot.start_time);
            const endH = timeToHour(slot.end_time);
            if (startH < minStart) minStart = startH;
            if (endH > maxEnd) maxEnd = endH;
            hasConfig = true;
          });
      }
    }

    // Use defaults if no configuration found
    if (!hasConfig) {
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
  }, [selectedProfessionalId, currentDate, locationSchedules, professionalAvailability]);

  return config;
}

import type { CenterLocation } from '@/hooks/useLocations';
import type { LocationSchedule } from '@/hooks/useLocationSchedules';

/**
 * Given a date, locations, and their schedules, returns the best default
 * location + modality for that day of the week.
 *
 * Priority:
 *  1. Public locations open that day
 *  2. If multiple public, prefer online over in_person (for video-first centers)
 *  3. If no public, use private locations open that day
 *  4. If nothing matches, return null
 *
 * Returns { locationId, modality } where modality maps to form values
 * ('in_person' | 'google_meet' | 'zoom' | 'custom_link').
 */
export interface LocationDefault {
  locationId: string;
  modality: string; // 'in_person' for physical locations, keeps current modality for online
  isOnline: boolean;
}

export function getDefaultLocationForDate(
  date: Date,
  locations: CenterLocation[],
  schedules: LocationSchedule[]
): LocationDefault | null {
  if (!locations.length || !schedules.length) return null;

  // date-fns/JS: Sunday=0, Monday=1 … Saturday=6
  // location_schedules: same convention (0=Sunday … 6=Saturday)
  const dayOfWeek = date.getDay();

  // Build a set of location IDs that are open on this day
  const openLocationIds = new Set<string>();
  for (const s of schedules) {
    if (s.day_of_week === dayOfWeek && s.is_open) {
      openLocationIds.add(s.location_id);
    }
  }

  if (openLocationIds.size === 0) return null;

  // Filter active locations that are open on this day
  const openLocations = locations.filter(
    (loc) => loc.is_active !== false && openLocationIds.has(loc.id)
  );

  if (openLocations.length === 0) return null;

  // Separate public vs private
  const publicLocations = openLocations.filter((l) => l.is_public !== false);
  const privateLocations = openLocations.filter((l) => l.is_public === false);

  // Pick from public first, then private
  const candidates = publicLocations.length > 0 ? publicLocations : privateLocations;

  if (candidates.length === 0) return null;

  // If only one candidate, use it
  if (candidates.length === 1) {
    return toDefault(candidates[0]);
  }

  // Multiple candidates: prefer in_person (physical) over online for default,
  // since online sessions typically need explicit modality choice
  const physicalCandidates = candidates.filter((l) => l.location_type !== 'online');
  const onlineCandidates = candidates.filter((l) => l.location_type === 'online');

  // If there are physical locations, pick the first
  if (physicalCandidates.length > 0) {
    return toDefault(physicalCandidates[0]);
  }

  // Only online locations available
  if (onlineCandidates.length > 0) {
    return toDefault(onlineCandidates[0]);
  }

  return toDefault(candidates[0]);
}

function toDefault(location: CenterLocation): LocationDefault {
  const isOnline = location.location_type === 'online';
  return {
    locationId: location.id,
    modality: isOnline ? 'google_meet' : 'in_person',
    isOnline,
  };
}

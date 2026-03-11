import type { CenterLocation } from '@/hooks/useLocations';
import type { LocationSchedule } from '@/hooks/useLocationSchedules';

export interface LocationDefault {
  locationId: string;
  /** Form modality value: 'in_person' | 'google_meet' | 'zoom' | 'custom_link' */
  modality: string;
  isOnline: boolean;
}

/**
 * Determines the best default location for a given date based on:
 *  1. Explicit default (`is_default`) for that day of the week
 *  2. Public locations open that day (over private)
 *  3. First available location as fallback
 *
 * For online locations the modality is derived from `defaultVideoProvider`
 * (the professional's configured provider), never hardcoded.
 */
export function getDefaultLocationForDate(
  date: Date,
  locations: CenterLocation[],
  schedules: LocationSchedule[],
  defaultVideoProvider?: string | null
): LocationDefault | null {
  if (!locations.length || !schedules.length) return null;

  const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat

  // Collect schedules for this day that are open
  const daySchedules = schedules.filter(
    (s) => s.day_of_week === dayOfWeek && s.is_open
  );

  if (daySchedules.length === 0) return null;

  // Build a map locationId → schedule for quick lookup
  const scheduleByLocation = new Map<string, LocationSchedule>();
  for (const s of daySchedules) {
    scheduleByLocation.set(s.location_id, s);
  }

  // Active locations that are open this day
  const openLocations = locations.filter(
    (loc) => loc.is_active !== false && scheduleByLocation.has(loc.id)
  );

  if (openLocations.length === 0) return null;

  // ── Priority 1: explicit default for this day ──
  const explicitDefault = openLocations.find((loc) => {
    const sched = scheduleByLocation.get(loc.id);
    return sched?.is_default === true;
  });

  if (explicitDefault) {
    return toDefault(explicitDefault, defaultVideoProvider);
  }

  // ── Priority 2: public > private ──
  const publicLocations = openLocations.filter((l) => l.is_public === true);
  const privateLocations = openLocations.filter((l) => l.is_public !== true);

  const candidates =
    publicLocations.length > 0 ? publicLocations : privateLocations;

  if (candidates.length === 0) return null;

  // Return first candidate (no physical>online bias)
  return toDefault(candidates[0], defaultVideoProvider);
}

function toDefault(
  location: CenterLocation,
  defaultVideoProvider?: string | null
): LocationDefault {
  const isOnline = location.location_type === 'online';

  let modality: string;
  if (isOnline) {
    // Derive from professional's configured provider
    if (defaultVideoProvider === 'zoom') {
      modality = 'zoom';
    } else if (defaultVideoProvider === 'google_meet') {
      modality = 'google_meet';
    } else {
      // Fallback: use custom_link so nothing is hardcoded
      modality = 'custom_link';
    }
  } else {
    modality = 'in_person';
  }

  return { locationId: location.id, modality, isOnline };
}

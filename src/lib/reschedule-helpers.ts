// Shared helpers used by the two reschedule flows (patient portal + public token)
// for showing, comparing and confirming location changes.

export interface RescheduleLocation {
  id: string;
  name: string;
  location_type?: 'in_person' | 'online' | null;
  street?: string | null;
  number_details?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export function isOnlineLocation(loc?: Pick<RescheduleLocation, 'location_type'> | null): boolean {
  return loc?.location_type === 'online';
}

/**
 * Builds the human-readable address line for a location.
 * Returns "Sesión online" for online locations.
 */
export function formatLocationLine(loc?: RescheduleLocation | null): string {
  if (!loc) return 'Ubicación no especificada';
  if (isOnlineLocation(loc)) return 'Sesión online';

  const street = loc.street
    ? `${loc.street}${loc.number_details ? ' ' + loc.number_details : ''}`
    : '';
  const cityPart = [loc.postal_code, loc.city].filter(Boolean).join(' ');
  return [street, cityPart].filter(Boolean).join(', ') || 'Sin dirección';
}

/**
 * Resolves the session_modality value for a given target location, optionally
 * preserving zoom / google_meet sub-types when the original session was already
 * online and the new location is also online.
 *
 * Valid modality values in the model: 'in_person' | 'online' | 'zoom' | 'google_meet'.
 */
export function resolveModalityForLocation(
  loc: Pick<RescheduleLocation, 'location_type'> | null | undefined,
  previousModality?: string | null,
): 'in_person' | 'online' | 'zoom' | 'google_meet' {
  if (!loc || loc.location_type !== 'online') return 'in_person';
  if (previousModality === 'zoom' || previousModality === 'google_meet') {
    return previousModality;
  }
  return 'online';
}

export interface LocationChangeSummary {
  changed: boolean;
  modalityChanged: boolean;
  fromOnline: boolean;
  toOnline: boolean;
}

export function summarizeLocationChange(
  original: RescheduleLocation | null | undefined,
  next: RescheduleLocation | null | undefined,
): LocationChangeSummary {
  const fromOnline = isOnlineLocation(original);
  const toOnline = isOnlineLocation(next);
  const changed = (original?.id || null) !== (next?.id || null);
  return {
    changed,
    modalityChanged: changed && fromOnline !== toOnline,
    fromOnline,
    toOnline,
  };
}

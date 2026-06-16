interface GoogleEventLike {
  status?: string | null;
  description?: string | null;
  extendedProperties?: {
    private?: {
      psycma_session_id?: string | null;
    };
  };
}

export function buildGoogleEventsListParams(params: {
  syncToken?: string | null;
  timeMin?: string;
  timeMax?: string;
  pageToken?: string;
}): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.syncToken) {
    searchParams.set('syncToken', params.syncToken);
  } else {
    if (params.timeMin) searchParams.set('timeMin', params.timeMin);
    if (params.timeMax) searchParams.set('timeMax', params.timeMax);
    searchParams.set('orderBy', 'startTime');
  }

  searchParams.set('maxResults', '2500');
  searchParams.set('showDeleted', 'true');
  searchParams.set('singleEvents', 'true');
  if (params.pageToken) searchParams.set('pageToken', params.pageToken);

  return searchParams;
}

export function shouldTreatGoogleEventAsExisting(
  event: GoogleEventLike | undefined,
  fullSync: boolean
): boolean {
  if (event) return event.status !== 'cancelled';
  return !fullSync;
}

export function getPsycmaSessionIdFromDescription(
  description: string | null | undefined
): string | null {
  if (!description) return null;
  const match = description.match(/\[PSYCMA(?:_SESSION_ID)?:([^\]]+)\]/);
  return match ? match[1] : null;
}

export function isPsycmaGoogleEvent(event: GoogleEventLike): boolean {
  if (event.extendedProperties?.private?.psycma_session_id) return true;
  return Boolean(getPsycmaSessionIdFromDescription(event.description));
}

export function canRequestGoogleSync(params: {
  isServiceRequest: boolean;
  authenticatedUserId: string | null;
  professionalId: string | null;
  syncAllProfessionals: boolean;
}): boolean {
  if (params.isServiceRequest) return true;
  if (params.syncAllProfessionals) return false;
  return Boolean(
    params.authenticatedUserId &&
    params.professionalId === params.authenticatedUserId
  );
}

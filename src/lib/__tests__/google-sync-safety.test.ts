import { describe, expect, it } from 'vitest';
import {
  buildGoogleEventsListParams,
  canRequestGoogleSync,
  getPsycmaSessionIdFromDescription,
  isPsycmaGoogleEvent,
  shouldTreatGoogleEventAsExisting,
} from '../../../supabase/functions/_shared/googleSyncSafety';

describe('Google sync safety rules', () => {
  it('keeps allowed parameters stable during incremental sync', () => {
    const params = buildGoogleEventsListParams({
      syncToken: 'sync-token',
      timeMin: '2026-01-01T00:00:00Z',
      timeMax: '2026-12-31T23:59:59Z',
      pageToken: 'page-token',
    });

    expect(params.get('syncToken')).toBe('sync-token');
    expect(params.get('singleEvents')).toBe('true');
    expect(params.get('showDeleted')).toBe('true');
    expect(params.get('pageToken')).toBe('page-token');
    expect(params.has('orderBy')).toBe(false);
    expect(params.has('timeMin')).toBe(false);
    expect(params.has('timeMax')).toBe(false);
  });

  it('does not recreate unchanged events omitted from incremental responses', () => {
    expect(shouldTreatGoogleEventAsExisting(undefined, false)).toBe(true);
  });

  it('treats events absent from a completed full sync as missing', () => {
    expect(shouldTreatGoogleEventAsExisting(undefined, true)).toBe(false);
  });

  it('treats cancelled Google events as missing', () => {
    expect(shouldTreatGoogleEventAsExisting({ status: 'cancelled' }, false)).toBe(false);
  });

  it('recognizes current and legacy Psycma markers', () => {
    expect(getPsycmaSessionIdFromDescription('[PSYCMA:session-1]')).toBe('session-1');
    expect(getPsycmaSessionIdFromDescription('[PSYCMA_SESSION_ID:session-2]')).toBe('session-2');
    expect(isPsycmaGoogleEvent({
      extendedProperties: { private: { psycma_session_id: 'session-3' } },
    })).toBe(true);
  });

  it('only lets browser users sync their own professional account', () => {
    expect(canRequestGoogleSync({
      isServiceRequest: false,
      authenticatedUserId: 'user-1',
      professionalId: 'user-1',
      syncAllProfessionals: false,
    })).toBe(true);

    expect(canRequestGoogleSync({
      isServiceRequest: false,
      authenticatedUserId: 'user-1',
      professionalId: 'user-2',
      syncAllProfessionals: false,
    })).toBe(false);

    expect(canRequestGoogleSync({
      isServiceRequest: false,
      authenticatedUserId: 'user-1',
      professionalId: null,
      syncAllProfessionals: true,
    })).toBe(false);
  });

  it('allows trusted service calls to run global syncs', () => {
    expect(canRequestGoogleSync({
      isServiceRequest: true,
      authenticatedUserId: null,
      professionalId: null,
      syncAllProfessionals: true,
    })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { checkPatientConsent } from '@/lib/consent-verification';

interface FakeConsentRow {
  id: string;
  status: string | null;
  signed_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  verification_responses: unknown;
}

function fakeSupabase(rows: FakeConsentRow[]): SupabaseClient<Database> {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
  return client as unknown as SupabaseClient<Database>;
}

function erroringSupabase(): SupabaseClient<Database> {
  const client = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: new Error('boom') }),
      }),
    }),
  };
  return client as unknown as SupabaseClient<Database>;
}

const PATIENT_ID = 'patient-1';

describe('checkPatientConsent', () => {
  it('denies when the patient has no consent at all', async () => {
    const result = await checkPatientConsent(fakeSupabase([]), PATIENT_ID, 'recording');
    expect(result).toEqual({ granted: false, reason: 'no_consent' });
  });

  it('denies when no consent addresses this purpose', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { channel_email: true }, // unrelated purpose
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toEqual({ granted: false, reason: 'no_consent' });
  });

  it('denies when the consent addressing the purpose was never signed', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'pending',
        signed_at: null,
        revoked_at: null,
        expires_at: null,
        verification_responses: { recording: true },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toEqual({ granted: false, reason: 'not_signed' });
  });

  it('denies when the most recent consent for this purpose was revoked', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: '2026-02-01T10:00:00Z',
        expires_at: null,
        verification_responses: { recording: true },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toMatchObject({ granted: false, reason: 'revoked', consentId: 'c1' });
  });

  it('denies when the most recent consent for this purpose has expired', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'signed',
        signed_at: '2020-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: '2020-02-01T10:00:00Z', // long past
        verification_responses: { recording: true },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toMatchObject({ granted: false, reason: 'expired', consentId: 'c1' });
  });

  it('denies when the patient explicitly declined this purpose', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { recording: false },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toMatchObject({ granted: false, reason: 'purpose_not_granted', consentId: 'c1' });
  });

  it('grants when signed, valid, and the purpose was explicitly authorized', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'c1',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { recording: true, ai_processing: true },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'ai_processing');
    expect(result).toMatchObject({ granted: true, consentId: 'c1' });
  });

  it('treats the legacy string "true" the same as a real boolean', async () => {
    const rows: FakeConsentRow[] = [
      {
        // Legacy-style consent: verification_checkboxes was a plain string
        // array and this response happens to be stored as the string "true"
        // rather than a boolean (see ConsentDetailDialog's historical guard).
        id: 'legacy-1',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { recording: 'true' },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'recording');
    expect(result).toMatchObject({ granted: true, consentId: 'legacy-1' });
  });

  it('picks the most recently signed consent when several address the same purpose', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'older-grant',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { channel_whatsapp: true },
      },
      {
        id: 'newer-withdrawal',
        status: 'signed',
        signed_at: '2026-03-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { channel_whatsapp: false },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'channel_whatsapp');
    // The newer consent revisited the purpose and declined it — it must win
    // even though an older signed consent granted it.
    expect(result).toMatchObject({ granted: false, reason: 'purpose_not_granted', consentId: 'newer-withdrawal' });
  });

  it('picks the most recently signed consent the other way around too', async () => {
    const rows: FakeConsentRow[] = [
      {
        id: 'older-withdrawal',
        status: 'signed',
        signed_at: '2026-01-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { channel_email: false },
      },
      {
        id: 'newer-grant',
        status: 'signed',
        signed_at: '2026-03-01T10:00:00Z',
        revoked_at: null,
        expires_at: null,
        verification_responses: { channel_email: true },
      },
    ];
    const result = await checkPatientConsent(fakeSupabase(rows), PATIENT_ID, 'channel_email');
    expect(result).toMatchObject({ granted: true, consentId: 'newer-grant' });
  });

  it('fails closed on a missing patient id', async () => {
    const result = await checkPatientConsent(fakeSupabase([]), '', 'recording');
    expect(result).toEqual({ granted: false, reason: 'no_consent' });
  });

  it('fails closed on a query error instead of throwing', async () => {
    const result = await checkPatientConsent(erroringSupabase(), PATIENT_ID, 'recording');
    expect(result).toEqual({ granted: false, reason: 'no_consent' });
  });
});

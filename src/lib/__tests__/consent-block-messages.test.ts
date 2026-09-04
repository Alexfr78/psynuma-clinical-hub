import { describe, expect, it } from 'vitest';
import type { ConsentCheckResult, ConsentPurpose } from '@/lib/consent-verification';
import {
  ALL_CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
  consentPurposeStatusReason,
  consentSendBlockReason,
  countGrantedConsentPurposes,
} from '@/lib/consent-block-messages';

describe('consentPurposeStatusReason', () => {
  it('returns null when there is no result yet (loading)', () => {
    expect(consentPurposeStatusReason(undefined)).toBeNull();
  });

  it('returns null when the purpose is granted', () => {
    expect(consentPurposeStatusReason({ granted: true, consentId: 'c1' })).toBeNull();
  });

  it('describes each denial reason in plain language', () => {
    const cases: { reason: ConsentCheckResult['reason']; expectSubstring: string }[] = [
      { reason: 'no_consent', expectSubstring: 'ningún consentimiento registrado' },
      { reason: 'not_signed', expectSubstring: 'pendiente de firma' },
      { reason: 'revoked', expectSubstring: 'revocó' },
      { reason: 'expired', expectSubstring: 'caducado' },
      { reason: 'purpose_not_granted', expectSubstring: 'no marcó esta casilla' },
    ];

    for (const { reason, expectSubstring } of cases) {
      const message = consentPurposeStatusReason({ granted: false, reason });
      expect(message).toContain(expectSubstring);
    }
  });
});

describe('countGrantedConsentPurposes', () => {
  it('returns 0 of 5 when results are not loaded yet', () => {
    expect(countGrantedConsentPurposes(undefined)).toEqual({ granted: 0, total: 5 });
  });

  it('counts only purposes explicitly marked as granted', () => {
    const results: Partial<Record<ConsentPurpose, ConsentCheckResult>> = {
      recording: { granted: true, consentId: 'c1' },
      ai_processing: { granted: true, consentId: 'c1' },
      report_generation: { granted: false, reason: 'purpose_not_granted', consentId: 'c1' },
      channel_whatsapp: { granted: false, reason: 'revoked', consentId: 'c2' },
      channel_email: { granted: true, consentId: 'c1' },
    };
    expect(countGrantedConsentPurposes(results)).toEqual({ granted: 3, total: 5 });
  });

  it('treats a missing purpose entry as not granted', () => {
    const results: Partial<Record<ConsentPurpose, ConsentCheckResult>> = {
      recording: { granted: true, consentId: 'c1' },
    };
    expect(countGrantedConsentPurposes(results)).toEqual({ granted: 1, total: 5 });
  });

  it('always reports the same fixed total as ALL_CONSENT_PURPOSES', () => {
    expect(countGrantedConsentPurposes({}).total).toBe(ALL_CONSENT_PURPOSES.length);
  });
});

describe('CONSENT_PURPOSE_LABELS', () => {
  it('has a user-facing label for every purpose', () => {
    for (const purpose of ALL_CONSENT_PURPOSES) {
      expect(CONSENT_PURPOSE_LABELS[purpose]).toBeTruthy();
    }
  });
});

describe('consentSendBlockReason (existing behaviour, unchanged)', () => {
  it('returns null when the send is allowed', () => {
    expect(consentSendBlockReason('whatsapp', { granted: true })).toBeNull();
  });

  it('mentions the channel by name in the denial message', () => {
    const message = consentSendBlockReason('whatsapp', { granted: false, reason: 'revoked' });
    expect(message).toContain('WhatsApp');
  });
});

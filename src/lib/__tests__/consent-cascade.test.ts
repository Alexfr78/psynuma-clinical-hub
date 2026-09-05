import { describe, expect, it } from 'vitest';
import {
  applyConsentCascade,
  getCascadeChildren,
  getCascadeParent,
  isCascadeUnlocked,
} from '@/lib/consent-cascade';
import type { VerificationResponse } from '@/lib/consent-acceptance';

describe('getCascadeParent / getCascadeChildren', () => {
  it('describes the recording -> ai_processing -> report_generation -> channels tree', () => {
    expect(getCascadeParent('recording')).toBeNull();
    expect(getCascadeParent('ai_processing')).toBe('recording');
    expect(getCascadeParent('report_generation')).toBe('ai_processing');
    expect(getCascadeParent('channel_whatsapp')).toBe('report_generation');
    expect(getCascadeParent('channel_email')).toBe('report_generation');
  });

  it('lists both channels as children of report_generation', () => {
    expect(getCascadeChildren('report_generation').sort()).toEqual(['channel_email', 'channel_whatsapp']);
  });

  it('treats keys outside the known cascade (e.g. legacy numeric keys) as unrelated', () => {
    expect(getCascadeParent('0')).toBeNull();
    expect(getCascadeChildren('0')).toEqual([]);
  });
});

describe('isCascadeUnlocked', () => {
  it('the root purpose is always unlocked', () => {
    expect(isCascadeUnlocked('recording', {})).toBe(true);
  });

  it('a dependent purpose is locked until its parent is explicitly authorized', () => {
    expect(isCascadeUnlocked('ai_processing', {})).toBe(false);
    expect(isCascadeUnlocked('ai_processing', { recording: 'not_authorized' })).toBe(false);
    expect(isCascadeUnlocked('ai_processing', { recording: 'authorized' })).toBe(true);
  });

  it('unlocks report_generation only once ai_processing is authorized, independent of recording', () => {
    const responses: Record<string, VerificationResponse> = { recording: 'authorized', ai_processing: 'not_authorized' };
    expect(isCascadeUnlocked('report_generation', responses)).toBe(false);
    expect(isCascadeUnlocked('report_generation', { ...responses, ai_processing: 'authorized' })).toBe(true);
  });

  it('unlocks both channels independently once report_generation is authorized', () => {
    const responses: Record<string, VerificationResponse> = { report_generation: 'authorized' };
    expect(isCascadeUnlocked('channel_whatsapp', responses)).toBe(true);
    expect(isCascadeUnlocked('channel_email', responses)).toBe(true);
  });

  it('keys outside the known cascade are never locked', () => {
    expect(isCascadeUnlocked('0', {})).toBe(true);
  });
});

describe('applyConsentCascade', () => {
  it('records an "authorized" answer without touching anything else', () => {
    const result = applyConsentCascade('recording', 'authorized', {});
    expect(result).toEqual({ recording: 'authorized' });
  });

  it('revoking a purpose forces its already-authorized descendants down to not_authorized', () => {
    const responses: Record<string, VerificationResponse> = {
      recording: 'authorized',
      ai_processing: 'authorized',
      report_generation: 'authorized',
      channel_whatsapp: 'authorized',
      channel_email: 'authorized',
    };
    const result = applyConsentCascade('recording', 'not_authorized', responses);
    expect(result).toEqual({
      recording: 'not_authorized',
      ai_processing: 'not_authorized',
      report_generation: 'not_authorized',
      channel_whatsapp: 'not_authorized',
      channel_email: 'not_authorized',
    });
  });

  it('cascades from a mid-tree purpose only to its own descendants, not its ancestor', () => {
    const responses: Record<string, VerificationResponse> = {
      recording: 'authorized',
      ai_processing: 'authorized',
      report_generation: 'authorized',
      channel_whatsapp: 'authorized',
      channel_email: 'not_authorized',
    };
    const result = applyConsentCascade('report_generation', 'not_authorized', responses);
    expect(result).toEqual({
      recording: 'authorized', // untouched: it's the parent, not a descendant
      ai_processing: 'authorized', // untouched: it's the parent, not a descendant
      report_generation: 'not_authorized',
      channel_whatsapp: 'not_authorized', // was authorized, forced down
      channel_email: 'not_authorized', // already not_authorized
    });
  });

  it('leaves never-answered descendants untouched (locking handles them, not a forced answer)', () => {
    const result = applyConsentCascade('recording', 'not_authorized', { recording: 'authorized' });
    expect(result).toEqual({ recording: 'not_authorized' });
    expect(result.ai_processing).toBeUndefined();
  });

  it('does nothing extra when a leaf purpose is answered', () => {
    const responses: Record<string, VerificationResponse> = { report_generation: 'authorized' };
    const result = applyConsentCascade('channel_whatsapp', 'not_authorized', responses);
    expect(result).toEqual({ report_generation: 'authorized', channel_whatsapp: 'not_authorized' });
  });
});

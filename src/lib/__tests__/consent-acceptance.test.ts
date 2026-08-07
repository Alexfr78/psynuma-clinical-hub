import { describe, expect, it } from 'vitest';
import {
  areVerificationResponsesComplete,
  isCancellationPolicyAccepted,
} from '@/lib/consent-acceptance';

describe('cancellation policy acceptance', () => {
  it('does not treat an explicit refusal as acceptance', () => {
    expect(isCancellationPolicyAccepted(1, { 0: 'not_authorized' })).toBe(false);
  });

  it('requires every policy verification to be affirmative', () => {
    expect(isCancellationPolicyAccepted(2, { 0: 'authorized', 1: 'authorized' })).toBe(true);
    expect(isCancellationPolicyAccepted(2, { 0: 'authorized' })).toBe(false);
  });

  it('keeps generic consent verification completion independent from its answer', () => {
    expect(areVerificationResponsesComplete(1, { 0: 'not_authorized' })).toBe(true);
  });
});

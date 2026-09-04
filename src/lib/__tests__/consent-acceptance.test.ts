import { describe, expect, it } from 'vitest';
import {
  areVerificationResponsesComplete,
  isCancellationPolicyAccepted,
} from '@/lib/consent-acceptance';
import type { VerificationCheckboxItem } from '@/lib/consent-checkboxes';

function checkbox(key: string, required = true): VerificationCheckboxItem {
  return { key, label: key, required };
}

describe('cancellation policy acceptance', () => {
  it('does not treat an explicit refusal as acceptance', () => {
    expect(isCancellationPolicyAccepted([checkbox('0')], { '0': 'not_authorized' })).toBe(false);
  });

  it('requires every policy verification to be affirmative', () => {
    expect(
      isCancellationPolicyAccepted([checkbox('0'), checkbox('1')], { '0': 'authorized', '1': 'authorized' }),
    ).toBe(true);
    expect(
      isCancellationPolicyAccepted([checkbox('0'), checkbox('1')], { '0': 'authorized' }),
    ).toBe(false);
  });

  it('keeps generic consent verification completion independent from its answer', () => {
    expect(areVerificationResponsesComplete([checkbox('0')], { '0': 'not_authorized' })).toBe(true);
  });

  it('does not block on checkboxes that are not required to be answered', () => {
    expect(areVerificationResponsesComplete([checkbox('0', false)], {})).toBe(true);
  });

  it('resolves legacy index-based keys the same way as new semantic keys', () => {
    // Legacy string checkboxes are normalized with key = String(index).
    expect(areVerificationResponsesComplete([checkbox('0'), checkbox('1')], { '0': 'authorized', '1': 'not_authorized' })).toBe(true);
    expect(areVerificationResponsesComplete([checkbox('recording'), checkbox('ai_processing')], { recording: 'authorized' })).toBe(false);
  });
});

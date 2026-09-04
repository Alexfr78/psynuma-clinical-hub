import type { VerificationCheckboxItem } from './consent-checkboxes';

export type VerificationResponse = 'authorized' | 'not_authorized' | undefined;

export function areVerificationResponsesComplete(
  checkboxes: VerificationCheckboxItem[],
  responses: Record<string, VerificationResponse>,
) {
  return checkboxes
    .filter((checkbox) => checkbox.required)
    .every((checkbox) => responses[checkbox.key] !== undefined);
}

export function isCancellationPolicyAccepted(
  checkboxes: VerificationCheckboxItem[],
  responses: Record<string, VerificationResponse>,
) {
  return checkboxes.length > 0
    && checkboxes.every((checkbox) => responses[checkbox.key] === 'authorized');
}

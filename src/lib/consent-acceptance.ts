export type VerificationResponse = 'authorized' | 'not_authorized' | undefined;

export function areVerificationResponsesComplete(
  verificationCount: number,
  responses: Record<number, VerificationResponse>,
) {
  return verificationCount === 0
    || Array.from({ length: verificationCount }, (_, index) => responses[index] !== undefined).every(Boolean);
}

export function isCancellationPolicyAccepted(
  verificationCount: number,
  responses: Record<number, VerificationResponse>,
) {
  return verificationCount > 0
    && Array.from({ length: verificationCount }, (_, index) => responses[index] === 'authorized').every(Boolean);
}

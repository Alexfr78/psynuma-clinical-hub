/**
 * Base URL used for patient-facing links included in messages (WhatsApp/email).
 *
 * Messages must never carry the Lovable preview domain, which requires a login
 * and is not reachable by patients. When the app runs on a preview/localhost
 * origin we fall back to the production domain.
 */
const PRODUCTION_BASE_URL = 'https://psycma.psicologosexual.com';

const NON_PUBLIC_ORIGIN_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /\.lovable\.app$/i,
  /\.lovableproject\.com$/i,
  /\.lovable\.dev$/i,
];

export function getPublicBaseUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_BASE_URL;
  const { hostname, origin } = window.location;
  if (NON_PUBLIC_ORIGIN_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return PRODUCTION_BASE_URL;
  }
  return origin;
}

export function buildPublicUrl(path: string): string {
  const base = getPublicBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

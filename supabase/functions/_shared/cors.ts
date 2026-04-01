const BASE_URL = Deno.env.get('APP_BASE_URL') || '';
const ALT_URL = Deno.env.get('APP_BASE_URL_ALT') || '';

const ALLOWED_ORIGINS = [BASE_URL, ALT_URL].filter(Boolean);

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin =
    ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

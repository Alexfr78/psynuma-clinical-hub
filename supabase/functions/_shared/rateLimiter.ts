import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function checkIpRateLimit(
  supabase: SupabaseClient,
  ip: string,
  action: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    if (Math.random() < 0.05) {
      await supabase.rpc('cleanup_old_rate_limit_entries');
    }

    const windowStart = new Date(
      Date.now() - windowMinutes * 60 * 1000
    ).toISOString();

    const { count, error } = await supabase
      .from('rate_limit_log')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('action', action)
      .gte('created_at', windowStart);

    if (error) {
      console.error('[rateLimiter] DB error, failing open:', error.message);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if ((count ?? 0) >= maxRequests) {
      return { allowed: false, retryAfterSeconds: windowMinutes * 60 };
    }

    await supabase.from('rate_limit_log').insert({ ip, action });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error('[rateLimiter] Unexpected error, failing open:', err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Verifies that the request has a valid authenticated/service_role JWT.
 * Anonymous/publishable keys and missing tokens are rejected.
 */
export async function hasAuthenticatedJWT(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return false;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.auth.getClaims(jwt);
    const role = (data?.claims as { role?: string })?.role;
    return !error && (role === "authenticated" || role === "service_role");
  } catch {
    return false;
  }
}

export function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

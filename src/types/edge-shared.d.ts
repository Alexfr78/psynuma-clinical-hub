// Ambient module declarations for Deno-style https imports inside
// supabase/functions/_shared, which some vitest suites import directly
// (e.g. src/lib/__tests__/payment-rules.test.ts, late-change.test.ts).
// The frontend typecheck (tsc) cannot resolve https: specifiers; the edge
// functions themselves resolve them through Deno's lockfile, so this file
// only tells tsc to treat them as typed `any` at the boundary.
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export type SupabaseClient = any;
  export function createClient(...args: any[]): any;
}
declare module "https://esm.sh/*";

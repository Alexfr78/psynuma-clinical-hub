/**
 * La implementación vive en `supabase/functions/_shared/fetchAllRows.ts` para que las edge
 * functions (Deno, sin alias `@/`) usen exactamente la misma lógica. Esto es solo un re-export.
 */
export * from '../../supabase/functions/_shared/fetchAllRows';

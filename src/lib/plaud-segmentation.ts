/**
 * Segmentación intra-archivo y detección de solapamiento para grabaciones Plaud.
 *
 * La lógica vive en `supabase/functions/_shared/plaud-segmentation.ts` porque la edge function
 * de ingesta (`sync-plaud-recordings`, Deno) necesita ejecutar exactamente las mismas reglas
 * que este módulo — sin path aliases (`@/...`) que Deno no resuelve. Este archivo es solo un
 * re-export para que el resto del frontend y los 241 tests de vitest (`src/lib/__tests__/
 * plaud-segmentation.test.ts`) sigan importando desde `@/lib/plaud-segmentation` sin cambios.
 *
 * No dupliques reglas aquí: cualquier cambio de comportamiento va en el archivo compartido.
 */

export * from '../../supabase/functions/_shared/plaud-segmentation';

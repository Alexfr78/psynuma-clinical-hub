/**
 * DNI/NIE del firmante en consentimientos: qué falta, cómo se valida y cómo se
 * rellena el documento.
 *
 * La lógica vive en `supabase/functions/_shared/consentIdentity.ts` porque
 * `update-consent-identity` la necesita igual en el servidor.
 */
export * from '../../supabase/functions/_shared/consentIdentity';

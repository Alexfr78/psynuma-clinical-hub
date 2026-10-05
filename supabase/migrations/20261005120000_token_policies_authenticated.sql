-- Las rutas públicas con token (/cita, /consentimiento, /factura, autorregistro)
-- fallaban si el visitante tenía una sesión iniciada en Psycma: la petición iba
-- como `authenticated` y estas políticas solo cubrían `anon`. La comprobación del
-- token es la misma; solo se amplía el rol al que aplica.
-- Aplicada en producción el 2026-10-05 vía query_database.

alter policy "Anon read session by valid token" on public.sessions to anon, authenticated;
alter policy "Anon update session by valid token" on public.sessions to anon, authenticated;
alter policy "Anon read location by valid session token" on public.center_locations to anon, authenticated;
alter policy "Anon read consent by valid token" on public.consents to anon, authenticated;
alter policy "Anon update consent by valid token" on public.consents to anon, authenticated;
alter policy "Anon read signatures by valid consent token" on public.consent_signatures to anon, authenticated;
alter policy "Anon insert signature by valid consent token" on public.consent_signatures to anon, authenticated;
alter policy "Anon read template by valid consent token" on public.consent_templates to anon, authenticated;
alter policy "Anon read invoice by valid token" on public.invoices to anon, authenticated;
alter policy "Anon read invoice items by valid token" on public.invoice_items to anon, authenticated;
alter policy "Anon can read link by token" on public.autoregistro_links to anon, authenticated;
alter policy "Anon can read template by token" on public.autoregistro_templates to anon, authenticated;
alter policy "Anon can insert entries via token" on public.autoregistro_entries to anon, authenticated;
alter policy "Anon can read entries for feedback" on public.autoregistro_entries to anon, authenticated;

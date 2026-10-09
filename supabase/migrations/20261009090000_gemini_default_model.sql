-- Gemini 2.5 Pro ya no se puede usar desde cuentas nuevas de Google (solo las que ya lo
-- usaban) y 2.0 Flash / 1.5 Pro están cerrados. El modelo por defecto pasa a Gemini 3.8 Flash,
-- igual que DEFAULT_GEMINI_MODEL en src/lib/ai-models.ts.
alter table public.centers alter column gemini_model set default 'gemini-3.8-flash';

-- Modelos cerrados por Google (2.0 Flash, 1.5 Pro) dejan de funcionar en cualquier centro; el
-- 2.5 Pro antiguo solo se cambia donde no se usa Gemini, porque a quien ya lo usaba le sigue
-- funcionando.
update public.centers
set gemini_model = 'gemini-3.8-flash'
where gemini_model in ('gemini-2.0-flash', 'gemini-1.5-pro')
   or (gemini_model = 'gemini-2.5-pro' and ai_provider is distinct from 'gemini');

-- Cobro directo en la cuenta principal de Stripe (sin Connect).
--
--   * `centers.stripe_charge_mode`: 'connected' (por defecto) cobra en la cuenta
--     Connect de cada profesional; 'platform' cobra en la cuenta principal de la
--     plataforma. El dinero de un centro en modo 'platform' llega a la cuenta
--     del dueño de la plataforma, así que el modo NO se puede cambiar desde la
--     app (roles anon/authenticated): solo desde la base o con service_role.
--   * En modo 'platform', la conexión Stripe del profesional guarda
--     `stripe_account_id = 'platform'` en lugar de un `acct_…`. Las edge functions
--     omiten entonces la cabecera `Stripe-Account` (ver _shared/stripeAccount.ts).
--     Ese valor solo se admite si el centro del profesional está en modo
--     'platform', y tampoco se puede escribir desde la app.
--   * Al sacar un centro del modo 'platform', sus conexiones 'platform' quedan
--     desactivadas.
--   * Las funciones son SECURITY INVOKER a propósito: `current_user` debe ser el
--     rol de quien escribe (anon/authenticated desde la app, service_role desde
--     edge functions). Con SECURITY DEFINER sería siempre el dueño.

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS stripe_charge_mode text NOT NULL DEFAULT 'connected';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'centers_stripe_charge_mode_check'
  ) THEN
    ALTER TABLE public.centers
      ADD CONSTRAINT centers_stripe_charge_mode_check
      CHECK (stripe_charge_mode IN ('connected', 'platform'));
  END IF;
END $$;

COMMENT ON COLUMN public.centers.stripe_charge_mode IS
  'connected: cobra en la cuenta Connect de cada profesional; platform: cobra en la cuenta principal de la plataforma. Solo modificable fuera de la app.';

-- ─── Guarda en centers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_center_stripe_charge_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_charge_mode = 'platform' AND current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'stripe_charge_mode solo se puede cambiar desde la administración de la plataforma';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stripe_charge_mode IS DISTINCT FROM OLD.stripe_charge_mode THEN
    IF current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'stripe_charge_mode solo se puede cambiar desde la administración de la plataforma';
    END IF;

    IF OLD.stripe_charge_mode = 'platform' THEN
      UPDATE public.oauth_connections oc
      SET stripe_account_status = 'disabled'
      FROM public.profiles p
      WHERE p.id = oc.professional_id
        AND p.center_id = NEW.id
        AND oc.provider = 'stripe'
        AND oc.stripe_account_id = 'platform';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_center_stripe_charge_mode ON public.centers;
CREATE TRIGGER guard_center_stripe_charge_mode
  BEFORE INSERT OR UPDATE OF stripe_charge_mode ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.guard_center_stripe_charge_mode();

-- ─── Guarda en oauth_connections ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_oauth_stripe_platform_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_mode text;
BEGIN
  IF NEW.stripe_account_id IS DISTINCT FROM 'platform' THEN
    RETURN NEW;
  END IF;

  -- La app nunca escribe filas 'platform' (desconectar es un DELETE).
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'La cuenta principal de Stripe solo se puede asignar desde la administración de la plataforma';
  END IF;

  SELECT c.stripe_charge_mode INTO v_mode
  FROM public.profiles p
  JOIN public.centers c ON c.id = p.center_id
  WHERE p.id = NEW.professional_id;

  IF v_mode IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'El centro del profesional no cobra en la cuenta principal de Stripe';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_oauth_stripe_platform_account ON public.oauth_connections;
CREATE TRIGGER guard_oauth_stripe_platform_account
  BEFORE INSERT OR UPDATE ON public.oauth_connections
  FOR EACH ROW EXECUTE FUNCTION public.guard_oauth_stripe_platform_account();

REVOKE ALL ON FUNCTION public.guard_center_stripe_charge_mode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_oauth_stripe_platform_account() FROM PUBLIC, anon, authenticated;

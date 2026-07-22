-- Replace the retired external payment integration with OTT Pay Checkout.
-- Historical orders are retained in a provider-neutral archive before the old
-- provider-specific tables are removed.

CREATE TABLE IF NOT EXISTS public.legacy_payment_orders (
    external_order_id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'CNY',
    process_status TEXT,
    processed_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'::JSONB,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.legacy_payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own legacy payment orders" ON public.legacy_payment_orders;
CREATE POLICY "Users can view own legacy payment orders"
    ON public.legacy_payment_orders FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.legacy_payment_orders FROM anon, authenticated;
GRANT SELECT ON public.legacy_payment_orders TO authenticated;
GRANT ALL ON public.legacy_payment_orders TO service_role;

DO $archive_old_payment_orders$
BEGIN
    IF to_regclass('public.afdian_orders') IS NOT NULL THEN
        INSERT INTO public.legacy_payment_orders (
            external_order_id, user_id, amount, currency, process_status,
            processed_at, raw, archived_at
        )
        SELECT
            out_trade_no, user_id, COALESCE(total_amount, show_amount), 'CNY',
            process_status, processed_at, raw, NOW()
        FROM public.afdian_orders
        ON CONFLICT (external_order_id) DO NOTHING;
    END IF;
END;
$archive_old_payment_orders$;

ALTER TABLE public.membership_entitlements
    DROP CONSTRAINT IF EXISTS membership_entitlements_source_check;
UPDATE public.membership_entitlements
SET source = 'legacy',
    metadata = COALESCE(metadata, '{}'::JSONB) || '{"sourceVersion":"external-payment-v1"}'::JSONB
WHERE source = 'afdian';
ALTER TABLE public.membership_entitlements
    ADD CONSTRAINT membership_entitlements_source_check
    CHECK (source IN ('legacy', 'ottpay', 'redemption', 'referral', 'admin', 'legacy_reward'));

ALTER TABLE public.apple_wallet_lots
    DROP CONSTRAINT IF EXISTS apple_wallet_lots_source_check;
UPDATE public.apple_wallet_lots
SET source = 'legacy',
    metadata = COALESCE(metadata, '{}'::JSONB) || '{"sourceVersion":"external-payment-v1"}'::JSONB
WHERE source = 'afdian';
ALTER TABLE public.apple_wallet_lots
    ADD CONSTRAINT apple_wallet_lots_source_check
    CHECK (source IN ('legacy', 'ottpay', 'redemption', 'referral', 'admin', 'refund'));

-- Existing databases may already have the V2 functions from an earlier
-- migration. Update their provider guards without changing signatures.
DO $update_payment_function_guards$
DECLARE
    function_ddl TEXT;
    updated_ddl TEXT;
BEGIN
    SELECT pg_get_functiondef(
        to_regprocedure('public.grant_membership_entitlement(uuid,text,integer,text,text,text,text,boolean,boolean,jsonb)')
    ) INTO function_ddl;
    IF function_ddl IS NOT NULL THEN
        updated_ddl := replace(
            function_ddl,
            'source = ''afdian''',
            'source IN (''legacy'', ''ottpay'')'
        );
        IF updated_ddl = function_ddl
           AND position('source IN (''legacy'', ''ottpay'')' in function_ddl) = 0 THEN
            RAISE EXCEPTION 'Could not update legacy payment guard in grant_membership_entitlement';
        END IF;
        IF updated_ddl <> function_ddl THEN EXECUTE updated_ddl; END IF;
    END IF;

    SELECT pg_get_functiondef(
        to_regprocedure('public.grant_apple_wallet(uuid,integer,integer,text,text,text,jsonb)')
    ) INTO function_ddl;
    IF function_ddl IS NOT NULL THEN
        updated_ddl := replace(
            function_ddl,
            'p_source = ''afdian''',
            'p_source = ''ottpay'''
        );
        IF updated_ddl = function_ddl
           AND position('p_source = ''ottpay''' in function_ddl) = 0 THEN
            RAISE EXCEPTION 'Could not update legacy payment guard in grant_apple_wallet';
        END IF;
        IF updated_ddl <> function_ddl THEN EXECUTE updated_ddl; END IF;
    END IF;
END;
$update_payment_function_guards$;

DROP TABLE IF EXISTS public.afdian_binding_codes CASCADE;
DROP TABLE IF EXISTS public.afdian_bindings CASCADE;
DROP TABLE IF EXISTS public.afdian_plan_mappings CASCADE;
DROP TABLE IF EXISTS public.afdian_orders CASCADE;

CREATE TABLE IF NOT EXISTS public.ottpay_orders (
    prepay_order_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL CHECK (currency IN ('CAD', 'USD', 'CNY')),
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'pending', 'processing', 'succeeded', 'failed', 'closed')),
    provider_status TEXT,
    provider_order_id TEXT,
    pay_url TEXT,
    expires_at TEXT,
    product_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    raw_response JSONB NOT NULL DEFAULT '{}'::JSONB,
    raw_callback JSONB NOT NULL DEFAULT '{}'::JSONB,
    raw_query JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ottpay_orders_user_created
    ON public.ottpay_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ottpay_orders_status_created
    ON public.ottpay_orders(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ottpay_orders_provider_order
    ON public.ottpay_orders(provider_order_id)
    WHERE provider_order_id IS NOT NULL AND provider_order_id <> '';

ALTER TABLE public.ottpay_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own OTT Pay orders" ON public.ottpay_orders;
CREATE POLICY "Users can view own OTT Pay orders"
    ON public.ottpay_orders FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.ottpay_orders FROM anon, authenticated;
GRANT SELECT ON public.ottpay_orders TO authenticated;
GRANT ALL ON public.ottpay_orders TO service_role;

DROP TRIGGER IF EXISTS update_ottpay_orders_updated_at ON public.ottpay_orders;
CREATE TRIGGER update_ottpay_orders_updated_at
    BEFORE UPDATE ON public.ottpay_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

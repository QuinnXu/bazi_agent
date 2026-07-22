-- Four-tier membership, fixed-term entitlements, and expiring apple wallets.
-- Runs after the legacy repricing migration so these V2 RPCs remain authoritative.
-- All billing mutations are service-role-only. Authenticated users can only read
-- their own entitlement and ledger rows through RLS.

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'free'
        CHECK (membership_tier IN ('free', 'plus', 'ultra')),
    ADD COLUMN IF NOT EXISTS plus_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultra_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_quotas_membership_tier
    ON public.user_quotas(membership_tier, membership_expires_at);

CREATE TABLE IF NOT EXISTS public.membership_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK (tier IN ('plus', 'ultra')),
    sku TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'admin'
        CHECK (source IN ('legacy', 'ottpay', 'redemption', 'referral', 'admin', 'legacy_reward')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    external_order_id TEXT,
    external_buyer_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_entitlements_external_order
    ON public.membership_entitlements(source, external_order_id)
    WHERE external_order_id IS NOT NULL AND external_order_id <> '';
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_user_period
    ON public.membership_entitlements(user_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_membership_entitlements_active_tier
    ON public.membership_entitlements(user_id, tier, ends_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_trial_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    external_buyer_id TEXT,
    entitlement_id UUID NOT NULL UNIQUE REFERENCES public.membership_entitlements(id) ON DELETE CASCADE,
    trial_ends_at TIMESTAMPTZ NOT NULL,
    upgrade_credit_expires_at TIMESTAMPTZ NOT NULL,
    upgrade_credit_redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_trial_claims_buyer
    ON public.billing_trial_claims(external_buyer_id)
    WHERE external_buyer_id IS NOT NULL AND external_buyer_id <> '';

CREATE TABLE IF NOT EXISTS public.apple_wallet_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'admin'
        CHECK (source IN ('legacy', 'ottpay', 'redemption', 'admin', 'refund')),
    sku TEXT NOT NULL,
    initial_amount INTEGER NOT NULL CHECK (initial_amount > 0),
    remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= initial_amount),
    expires_at TIMESTAMPTZ NOT NULL,
    external_order_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_apple_wallet_lots_external_order
    ON public.apple_wallet_lots(source, external_order_id)
    WHERE external_order_id IS NOT NULL AND external_order_id <> '';
CREATE INDEX IF NOT EXISTS idx_apple_wallet_lots_spend_order
    ON public.apple_wallet_lots(user_id, expires_at, created_at)
    WHERE remaining_amount > 0;

CREATE TABLE IF NOT EXISTS public.apple_charge_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_key TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    membership_tier TEXT NOT NULL CHECK (membership_tier IN ('free', 'plus', 'ultra')),
    requested_amount INTEGER NOT NULL DEFAULT 0 CHECK (requested_amount >= 0),
    daily_amount INTEGER NOT NULL DEFAULT 0 CHECK (daily_amount >= 0),
    wallet_amount INTEGER NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0),
    wallet_allocations JSONB NOT NULL DEFAULT '[]'::JSONB,
    billing_day DATE NOT NULL,
    fair_use_enforced BOOLEAN NOT NULL DEFAULT FALSE,
    fair_use_expires_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (daily_amount + wallet_amount = requested_amount OR membership_tier = 'ultra')
);

CREATE INDEX IF NOT EXISTS idx_apple_charges_user_created
    ON public.apple_charge_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apple_charges_ultra_fair_use
    ON public.apple_charge_transactions(user_id, created_at DESC)
    WHERE membership_tier = 'ultra' AND fair_use_enforced = TRUE;

ALTER TABLE public.membership_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_trial_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_wallet_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_charge_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own membership entitlements" ON public.membership_entitlements;
CREATE POLICY "Users can view own membership entitlements"
    ON public.membership_entitlements FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own billing trial claim" ON public.billing_trial_claims;
CREATE POLICY "Users can view own billing trial claim"
    ON public.billing_trial_claims FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own apple wallet" ON public.apple_wallet_lots;
CREATE POLICY "Users can view own apple wallet"
    ON public.apple_wallet_lots FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own apple charges" ON public.apple_charge_transactions;
CREATE POLICY "Users can view own apple charges"
    ON public.apple_charge_transactions FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.membership_entitlements FROM anon, authenticated;
REVOKE ALL ON public.billing_trial_claims FROM anon, authenticated;
REVOKE ALL ON public.apple_wallet_lots FROM anon, authenticated;
REVOKE ALL ON public.apple_charge_transactions FROM anon, authenticated;
GRANT SELECT ON public.membership_entitlements TO authenticated;
GRANT SELECT ON public.billing_trial_claims TO authenticated;
GRANT SELECT ON public.apple_wallet_lots TO authenticated;
GRANT SELECT ON public.apple_charge_transactions TO authenticated;
GRANT ALL ON public.membership_entitlements TO service_role;
GRANT ALL ON public.billing_trial_claims TO service_role;
GRANT ALL ON public.apple_wallet_lots TO service_role;
GRANT ALL ON public.apple_charge_transactions TO service_role;

ALTER TABLE public.redemption_codes
    DROP CONSTRAINT IF EXISTS redemption_codes_kind_check;
ALTER TABLE public.redemption_codes
    ADD CONSTRAINT redemption_codes_kind_check
        CHECK (kind IN ('membership_days', 'bonus_quota', 'combo', 'apple_wallet')),
    ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'plus'
        CHECK (membership_tier IN ('plus', 'ultra')),
    ADD COLUMN IF NOT EXISTS apple_amount INTEGER NOT NULL DEFAULT 0 CHECK (apple_amount >= 0),
    ADD COLUMN IF NOT EXISTS apple_expiry_days INTEGER NOT NULL DEFAULT 90 CHECK (apple_expiry_days > 0);

ALTER TABLE public.redemption_redemptions
    ADD COLUMN IF NOT EXISTS applied_membership_tier TEXT
        CHECK (applied_membership_tier IS NULL OR applied_membership_tier IN ('plus', 'ultra')),
    ADD COLUMN IF NOT EXISTS applied_apple_amount INTEGER NOT NULL DEFAULT 0 CHECK (applied_apple_amount >= 0),
    ADD COLUMN IF NOT EXISTS applied_wallet_expires_at TIMESTAMPTZ;

-- Convert legacy active paid users into Plus schedules and auditable entitlements.
UPDATE public.user_quotas
SET
    plus_expires_at = CASE
        WHEN membership_expires_at IS NULL THEN TIMESTAMPTZ '2099-12-31 23:59:59+00'
        ELSE membership_expires_at
    END,
    membership_tier = 'plus',
    daily_apple_limit = 30
WHERE is_paid = TRUE
  AND (membership_expires_at IS NULL OR membership_expires_at > NOW());

INSERT INTO public.membership_entitlements (
    user_id, tier, sku, source, starts_at, ends_at, metadata
)
SELECT
    q.user_id,
    'plus',
    'legacy-plus',
    'legacy',
    COALESCE(q.created_at, NOW()),
    COALESCE(q.plus_expires_at, TIMESTAMPTZ '2099-12-31 23:59:59+00'),
    jsonb_build_object('backfilled', TRUE)
FROM public.user_quotas q
WHERE q.is_paid = TRUE
  AND q.plus_expires_at > NOW()
  AND NOT EXISTS (
      SELECT 1 FROM public.membership_entitlements e
      WHERE e.user_id = q.user_id AND e.source = 'legacy' AND e.sku = 'legacy-plus'
  );

CREATE OR REPLACE FUNCTION public.grant_membership_entitlement(
    p_user_id UUID,
    p_tier TEXT,
    p_duration_days INTEGER,
    p_sku TEXT,
    p_source TEXT DEFAULT 'admin',
    p_external_order_id TEXT DEFAULT NULL,
    p_external_buyer_id TEXT DEFAULT NULL,
    p_is_trial BOOLEAN DEFAULT FALSE,
    p_is_trial_upgrade BOOLEAN DEFAULT FALSE,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    entitlement_id UUID,
    tier TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    current_tier TEXT,
    current_membership_expires_at TIMESTAMPTZ
) AS $grant_membership_entitlement$
DECLARE
    quota_row public.user_quotas%ROWTYPE;
    existing_row public.membership_entitlements%ROWTYPE;
    claim_row public.billing_trial_claims%ROWTYPE;
    safe_days INTEGER := GREATEST(0, COALESCE(p_duration_days, 0));
    now_value TIMESTAMPTZ := NOW();
    grant_start TIMESTAMPTZ;
    grant_end TIMESTAMPTZ;
    new_id UUID;
BEGIN
    IF p_tier NOT IN ('plus', 'ultra') OR safe_days <= 0 THEN
        RAISE EXCEPTION 'invalid membership grant';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

    IF p_external_order_id IS NOT NULL AND p_external_order_id <> '' THEN
        SELECT * INTO existing_row
        FROM public.membership_entitlements
        WHERE source = p_source AND external_order_id = p_external_order_id;
        IF FOUND THEN
            RETURN QUERY SELECT
                existing_row.id,
                existing_row.tier,
                existing_row.starts_at,
                existing_row.ends_at,
                COALESCE((SELECT membership_tier FROM public.user_quotas WHERE user_id = p_user_id), 'free'),
                (SELECT membership_expires_at FROM public.user_quotas WHERE user_id = p_user_id);
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.user_quotas (
        user_id, is_paid, daily_apple_limit, membership_tier,
        apples_used_today, last_reset_date
    ) VALUES (
        p_user_id, FALSE, 5, 'free', 0,
        (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE
    ) ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO quota_row
    FROM public.user_quotas
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF p_is_trial THEN
        IF p_tier <> 'plus' OR safe_days <> 3 THEN
            RAISE EXCEPTION 'trial must be a 3-day Plus entitlement';
        END IF;
        IF EXISTS (SELECT 1 FROM public.billing_trial_claims WHERE user_id = p_user_id)
            OR (p_external_buyer_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.billing_trial_claims WHERE external_buyer_id = p_external_buyer_id
            ))
            OR EXISTS (
                SELECT 1 FROM public.membership_entitlements
                WHERE user_id = p_user_id AND source IN ('legacy', 'ottpay')
            ) THEN
            RAISE EXCEPTION 'trial already used or user has purchased membership';
        END IF;
    END IF;

    IF p_is_trial_upgrade THEN
        SELECT * INTO claim_row
        FROM public.billing_trial_claims
        WHERE user_id = p_user_id
          AND upgrade_credit_redeemed_at IS NULL
          AND upgrade_credit_expires_at > now_value
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'trial upgrade credit unavailable';
        END IF;
    END IF;

    IF p_tier = 'plus' THEN
        grant_start := GREATEST(
            now_value,
            COALESCE(quota_row.plus_expires_at, now_value),
            COALESCE(quota_row.ultra_expires_at, now_value)
        );
        grant_end := grant_start + make_interval(days => safe_days);
        quota_row.plus_expires_at := grant_end;
    ELSE
        grant_start := GREATEST(now_value, COALESCE(quota_row.ultra_expires_at, now_value));
        grant_end := grant_start + make_interval(days => safe_days);

        IF quota_row.plus_expires_at IS NOT NULL AND quota_row.plus_expires_at > now_value THEN
            quota_row.plus_expires_at := quota_row.plus_expires_at + make_interval(days => safe_days);
            UPDATE public.membership_entitlements
            SET
                starts_at = CASE WHEN starts_at > now_value THEN starts_at + make_interval(days => safe_days) ELSE starts_at END,
                ends_at = ends_at + make_interval(days => safe_days)
            WHERE user_id = p_user_id
              AND tier = 'plus'
              AND ends_at > now_value;
        END IF;
        quota_row.ultra_expires_at := grant_end;
    END IF;

    INSERT INTO public.membership_entitlements (
        user_id, tier, sku, source, starts_at, ends_at,
        external_order_id, external_buyer_id, metadata
    ) VALUES (
        p_user_id, p_tier, p_sku, p_source, grant_start, grant_end,
        NULLIF(p_external_order_id, ''), NULLIF(p_external_buyer_id, ''), COALESCE(p_metadata, '{}'::JSONB)
    ) RETURNING id INTO new_id;

    IF p_is_trial THEN
        INSERT INTO public.billing_trial_claims (
            user_id, external_buyer_id, entitlement_id, trial_ends_at, upgrade_credit_expires_at
        ) VALUES (
            p_user_id, NULLIF(p_external_buyer_id, ''), new_id, grant_end, grant_end + INTERVAL '7 days'
        );
    ELSIF p_is_trial_upgrade THEN
        UPDATE public.billing_trial_claims
        SET upgrade_credit_redeemed_at = now_value
        WHERE id = claim_row.id;
    END IF;

    quota_row.membership_tier := CASE
        WHEN quota_row.ultra_expires_at IS NOT NULL AND quota_row.ultra_expires_at > now_value THEN 'ultra'
        WHEN quota_row.plus_expires_at IS NOT NULL AND quota_row.plus_expires_at > now_value THEN 'plus'
        ELSE 'free'
    END;
    quota_row.membership_expires_at := CASE quota_row.membership_tier
        WHEN 'ultra' THEN quota_row.ultra_expires_at
        WHEN 'plus' THEN quota_row.plus_expires_at
        ELSE NULL
    END;
    quota_row.is_paid := quota_row.membership_tier <> 'free';
    quota_row.daily_apple_limit := CASE WHEN quota_row.membership_tier = 'plus' THEN 30 ELSE 5 END;

    UPDATE public.user_quotas
    SET
        membership_tier = quota_row.membership_tier,
        plus_expires_at = quota_row.plus_expires_at,
        ultra_expires_at = quota_row.ultra_expires_at,
        membership_expires_at = quota_row.membership_expires_at,
        is_paid = quota_row.is_paid,
        daily_apple_limit = quota_row.daily_apple_limit,
        updated_at = now_value
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT
        new_id,
        p_tier,
        grant_start,
        grant_end,
        quota_row.membership_tier,
        quota_row.membership_expires_at;
END;
$grant_membership_entitlement$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.grant_apple_wallet(
    p_user_id UUID,
    p_amount INTEGER,
    p_expiry_days INTEGER DEFAULT 90,
    p_sku TEXT DEFAULT 'apple-wallet',
    p_source TEXT DEFAULT 'admin',
    p_external_order_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    wallet_lot_id UUID,
    granted_amount INTEGER,
    expires_at TIMESTAMPTZ,
    wallet_balance INTEGER,
    wallet_expires_at TIMESTAMPTZ
) AS $grant_apple_wallet$
DECLARE
    existing_row public.apple_wallet_lots%ROWTYPE;
    new_id UUID;
    expiry TIMESTAMPTZ;
    safe_amount INTEGER := GREATEST(0, COALESCE(p_amount, 0));
    safe_days INTEGER := GREATEST(0, COALESCE(p_expiry_days, 0));
BEGIN
    IF safe_amount <= 0 OR safe_days <= 0 THEN
        RAISE EXCEPTION 'invalid apple wallet grant';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

    IF p_external_order_id IS NOT NULL AND p_external_order_id <> '' THEN
        SELECT * INTO existing_row
        FROM public.apple_wallet_lots
        WHERE source = p_source AND external_order_id = p_external_order_id;
        IF FOUND THEN
            RETURN QUERY SELECT
                existing_row.id,
                existing_row.initial_amount,
                existing_row.expires_at,
                COALESCE((SELECT SUM(remaining_amount)::INTEGER FROM public.apple_wallet_lots
                    WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW()), 0),
                (SELECT MIN(expires_at) FROM public.apple_wallet_lots
                    WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW());
            RETURN;
        END IF;
    END IF;

    IF p_source = 'ottpay' AND EXISTS (
        SELECT 1 FROM public.user_quotas
        WHERE user_id = p_user_id
          AND ultra_expires_at IS NOT NULL
          AND ultra_expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'Ultra members cannot purchase apple packs while active';
    END IF;

    expiry := NOW() + make_interval(days => safe_days);
    INSERT INTO public.apple_wallet_lots (
        user_id, source, sku, initial_amount, remaining_amount,
        expires_at, external_order_id, metadata
    ) VALUES (
        p_user_id, p_source, p_sku, safe_amount, safe_amount,
        expiry, NULLIF(p_external_order_id, ''), COALESCE(p_metadata, '{}'::JSONB)
    ) RETURNING id INTO new_id;

    RETURN QUERY SELECT
        new_id,
        safe_amount,
        expiry,
        COALESCE((SELECT SUM(remaining_amount)::INTEGER FROM public.apple_wallet_lots
            WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW()), 0),
        (SELECT MIN(expires_at) FROM public.apple_wallet_lots
            WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW());
END;
$grant_apple_wallet$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.consume_user_apples(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.consume_user_apples(
    p_user_id UUID,
    p_count INTEGER DEFAULT 0,
    p_enforce_fair_use BOOLEAN DEFAULT FALSE,
    p_operation_key TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    user_id UUID,
    is_paid BOOLEAN,
    membership_tier TEXT,
    unlimited BOOLEAN,
    daily_apple_limit INTEGER,
    membership_expires_at TIMESTAMPTZ,
    next_membership_tier TEXT,
    next_membership_starts_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER,
    bonus_expires_at TIMESTAMPTZ,
    apples_used_today INTEGER,
    last_reset_date DATE,
    daily_remaining INTEGER,
    wallet_balance INTEGER,
    wallet_expires_at TIMESTAMPTZ,
    remaining INTEGER,
    charge_id UUID,
    fair_use_limited BOOLEAN,
    retry_after_seconds INTEGER
) AS $consume_user_apples$
DECLARE
    quota_row public.user_quotas%ROWTYPE;
    lot_row public.apple_wallet_lots%ROWTYPE;
    now_value TIMESTAMPTZ := NOW();
    today_key DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
    safe_count INTEGER := GREATEST(0, COALESCE(p_count, 0));
    effective_tier TEXT;
    bonus_active BOOLEAN;
    effective_daily_limit INTEGER;
    available_daily INTEGER;
    available_wallet INTEGER;
    wallet_to_spend INTEGER;
    spend_amount INTEGER;
    daily_spent INTEGER := 0;
    wallet_spent INTEGER := 0;
    allocations JSONB := '[]'::JSONB;
    new_charge_id UUID;
    active_count INTEGER;
    hour_count INTEGER;
    day_count INTEGER;
    retry_at TIMESTAMPTZ;
    operation_value TEXT := COALESCE(NULLIF(p_operation_key, ''), gen_random_uuid()::TEXT);
    repeated_operation BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.user_quotas (
        user_id, is_paid, daily_apple_limit, membership_tier,
        apples_used_today, last_reset_date
    ) VALUES (
        p_user_id, FALSE, 5, 'free', 0, today_key
    ) ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO quota_row
    FROM public.user_quotas
    WHERE user_quotas.user_id = p_user_id
    FOR UPDATE;

    IF p_operation_key IS NOT NULL AND p_operation_key <> '' THEN
        SELECT id INTO new_charge_id
        FROM public.apple_charge_transactions
        WHERE operation_key = p_operation_key AND apple_charge_transactions.user_id = p_user_id;
        IF FOUND THEN
            repeated_operation := TRUE;
            safe_count := 0;
            p_enforce_fair_use := FALSE;
        END IF;
    END IF;

    effective_tier := CASE
        WHEN quota_row.ultra_expires_at IS NOT NULL AND quota_row.ultra_expires_at > now_value THEN 'ultra'
        WHEN quota_row.plus_expires_at IS NOT NULL AND quota_row.plus_expires_at > now_value THEN 'plus'
        ELSE 'free'
    END;

    IF quota_row.last_reset_date IS DISTINCT FROM today_key THEN
        quota_row.apples_used_today := 0;
        quota_row.last_reset_date := today_key;
    END IF;

    bonus_active := COALESCE(quota_row.bonus_apple_limit, 0) > 0
        AND quota_row.bonus_expires_at IS NOT NULL
        AND quota_row.bonus_expires_at > now_value;
    IF NOT bonus_active THEN
        quota_row.bonus_apple_limit := 0;
    END IF;

    effective_daily_limit := CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END
        + CASE WHEN bonus_active THEN COALESCE(quota_row.bonus_apple_limit, 0) ELSE 0 END;
    available_daily := GREATEST(0, effective_daily_limit - COALESCE(quota_row.apples_used_today, 0));

    SELECT
        COALESCE(SUM(remaining_amount), 0)::INTEGER,
        MIN(expires_at)
    INTO available_wallet, consume_user_apples.wallet_expires_at
    FROM public.apple_wallet_lots
    WHERE apple_wallet_lots.user_id = p_user_id
      AND remaining_amount > 0
      AND expires_at > now_value;

    IF p_enforce_fair_use AND effective_tier = 'ultra' THEN
        SELECT COUNT(*)::INTEGER, MIN(fair_use_expires_at)
        INTO active_count, retry_at
        FROM public.apple_charge_transactions
        WHERE apple_charge_transactions.user_id = p_user_id
          AND membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND settled_at IS NULL
          AND refunded_at IS NULL
          AND fair_use_expires_at > now_value;

        SELECT COUNT(*)::INTEGER INTO hour_count
        FROM public.apple_charge_transactions
        WHERE apple_charge_transactions.user_id = p_user_id
          AND membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND created_at > now_value - INTERVAL '1 hour';

        SELECT COUNT(*)::INTEGER INTO day_count
        FROM public.apple_charge_transactions
        WHERE apple_charge_transactions.user_id = p_user_id
          AND membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND created_at > now_value - INTERVAL '24 hours';

        IF active_count >= 1 OR hour_count >= 60 OR day_count >= 300 THEN
            IF active_count < 1 AND hour_count >= 60 THEN
                SELECT MIN(created_at) + INTERVAL '1 hour' INTO retry_at
                FROM public.apple_charge_transactions
                WHERE apple_charge_transactions.user_id = p_user_id
                  AND membership_tier = 'ultra'
                  AND fair_use_enforced = TRUE
                  AND created_at > now_value - INTERVAL '1 hour';
            ELSIF active_count < 1 AND day_count >= 300 THEN
                SELECT MIN(created_at) + INTERVAL '24 hours' INTO retry_at
                FROM public.apple_charge_transactions
                WHERE apple_charge_transactions.user_id = p_user_id
                  AND membership_tier = 'ultra'
                  AND fair_use_enforced = TRUE
                  AND created_at > now_value - INTERVAL '24 hours';
            END IF;
            success := FALSE;
            fair_use_limited := TRUE;
            retry_after_seconds := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(retry_at, now_value + INTERVAL '1 minute') - now_value)))::INTEGER);
        END IF;
    END IF;

    IF success IS NULL THEN
        fair_use_limited := FALSE;
        retry_after_seconds := 0;
        IF effective_tier <> 'ultra' AND safe_count > available_daily + available_wallet THEN
            success := FALSE;
        ELSE
            success := TRUE;
        END IF;
    END IF;

    IF success AND effective_tier <> 'ultra' AND safe_count > 0 THEN
        daily_spent := LEAST(safe_count, available_daily);
        quota_row.apples_used_today := COALESCE(quota_row.apples_used_today, 0) + daily_spent;
        wallet_to_spend := safe_count - daily_spent;

        FOR lot_row IN
            SELECT * FROM public.apple_wallet_lots
            WHERE apple_wallet_lots.user_id = p_user_id
              AND remaining_amount > 0
              AND expires_at > now_value
            ORDER BY expires_at ASC, created_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN wallet_to_spend <= 0;
            spend_amount := LEAST(wallet_to_spend, lot_row.remaining_amount);
            UPDATE public.apple_wallet_lots
            SET remaining_amount = remaining_amount - spend_amount
            WHERE id = lot_row.id;
            allocations := allocations || jsonb_build_array(jsonb_build_object(
                'lotId', lot_row.id,
                'amount', spend_amount,
                'originalExpiresAt', lot_row.expires_at
            ));
            wallet_spent := wallet_spent + spend_amount;
            wallet_to_spend := wallet_to_spend - spend_amount;
        END LOOP;
    END IF;

    IF success AND NOT repeated_operation AND (safe_count > 0 OR p_enforce_fair_use) THEN
        INSERT INTO public.apple_charge_transactions (
            operation_key, user_id, membership_tier, requested_amount,
            daily_amount, wallet_amount, wallet_allocations, billing_day,
            fair_use_enforced, fair_use_expires_at
        ) VALUES (
            operation_value, p_user_id, effective_tier,
            CASE WHEN effective_tier = 'ultra' THEN 0 ELSE safe_count END,
            daily_spent, wallet_spent, allocations, today_key,
            p_enforce_fair_use AND effective_tier = 'ultra',
            CASE WHEN p_enforce_fair_use AND effective_tier = 'ultra' THEN now_value + INTERVAL '1 hour' ELSE NULL END
        ) RETURNING id INTO new_charge_id;
    END IF;

    quota_row.membership_tier := effective_tier;
    quota_row.is_paid := effective_tier <> 'free';
    quota_row.daily_apple_limit := CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END;
    quota_row.membership_expires_at := CASE effective_tier
        WHEN 'ultra' THEN quota_row.ultra_expires_at
        WHEN 'plus' THEN quota_row.plus_expires_at
        ELSE NULL
    END;

    UPDATE public.user_quotas
    SET
        membership_tier = quota_row.membership_tier,
        is_paid = quota_row.is_paid,
        daily_apple_limit = quota_row.daily_apple_limit,
        membership_expires_at = quota_row.membership_expires_at,
        bonus_apple_limit = quota_row.bonus_apple_limit,
        apples_used_today = quota_row.apples_used_today,
        last_reset_date = quota_row.last_reset_date,
        updated_at = now_value
    WHERE user_quotas.user_id = p_user_id;

    SELECT
        COALESCE(SUM(remaining_amount), 0)::INTEGER,
        MIN(expires_at)
    INTO consume_user_apples.wallet_balance, consume_user_apples.wallet_expires_at
    FROM public.apple_wallet_lots
    WHERE apple_wallet_lots.user_id = p_user_id
      AND remaining_amount > 0
      AND expires_at > now_value;

    consume_user_apples.user_id := p_user_id;
    consume_user_apples.is_paid := quota_row.is_paid;
    consume_user_apples.membership_tier := effective_tier;
    consume_user_apples.unlimited := effective_tier = 'ultra';
    consume_user_apples.daily_apple_limit := effective_daily_limit;
    consume_user_apples.membership_expires_at := quota_row.membership_expires_at;
    consume_user_apples.next_membership_tier := CASE
        WHEN effective_tier = 'ultra' AND quota_row.plus_expires_at > quota_row.ultra_expires_at THEN 'plus'
        ELSE NULL
    END;
    consume_user_apples.next_membership_starts_at := CASE
        WHEN effective_tier = 'ultra' AND quota_row.plus_expires_at > quota_row.ultra_expires_at THEN quota_row.ultra_expires_at
        ELSE NULL
    END;
    consume_user_apples.bonus_apple_limit := CASE WHEN bonus_active THEN quota_row.bonus_apple_limit ELSE 0 END;
    consume_user_apples.bonus_expires_at := CASE WHEN bonus_active THEN quota_row.bonus_expires_at ELSE NULL END;
    consume_user_apples.apples_used_today := quota_row.apples_used_today;
    consume_user_apples.last_reset_date := quota_row.last_reset_date;
    consume_user_apples.daily_remaining := GREATEST(0, effective_daily_limit - quota_row.apples_used_today);
    consume_user_apples.remaining := CASE
        WHEN effective_tier = 'ultra' THEN 0
        ELSE consume_user_apples.daily_remaining + consume_user_apples.wallet_balance
    END;
    consume_user_apples.charge_id := new_charge_id;
    RETURN NEXT;
END;
$consume_user_apples$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.settle_apple_charge(
    p_user_id UUID,
    p_charge_id UUID,
    p_refund BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $settle_apple_charge$
DECLARE
    charge_row public.apple_charge_transactions%ROWTYPE;
    allocation JSONB;
    lot_id UUID;
    restore_amount INTEGER;
    original_expiry TIMESTAMPTZ;
    today_key DATE := (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
BEGIN
    SELECT * INTO charge_row
    FROM public.apple_charge_transactions
    WHERE id = p_charge_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF charge_row.refunded_at IS NOT NULL OR charge_row.settled_at IS NOT NULL THEN
        RETURN TRUE;
    END IF;

    IF p_refund THEN
        IF charge_row.daily_amount > 0 THEN
            IF charge_row.billing_day = today_key THEN
                UPDATE public.user_quotas
                SET apples_used_today = GREATEST(0, apples_used_today - charge_row.daily_amount), updated_at = NOW()
                WHERE user_id = p_user_id AND last_reset_date = today_key;
            ELSE
                INSERT INTO public.apple_wallet_lots (
                    user_id, source, sku, initial_amount, remaining_amount,
                    expires_at, external_order_id, metadata
                ) VALUES (
                    p_user_id, 'refund', 'daily-refund', charge_row.daily_amount, charge_row.daily_amount,
                    NOW() + INTERVAL '24 hours', 'refund:' || charge_row.id || ':daily',
                    jsonb_build_object('chargeId', charge_row.id)
                ) ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        FOR allocation IN SELECT value FROM jsonb_array_elements(charge_row.wallet_allocations)
        LOOP
            lot_id := (allocation->>'lotId')::UUID;
            restore_amount := (allocation->>'amount')::INTEGER;
            original_expiry := (allocation->>'originalExpiresAt')::TIMESTAMPTZ;
            IF original_expiry > NOW() THEN
                UPDATE public.apple_wallet_lots
                SET remaining_amount = LEAST(initial_amount, remaining_amount + restore_amount)
                WHERE id = lot_id AND user_id = p_user_id;
            ELSE
                INSERT INTO public.apple_wallet_lots (
                    user_id, source, sku, initial_amount, remaining_amount,
                    expires_at, external_order_id, metadata
                ) VALUES (
                    p_user_id, 'refund', 'expired-wallet-refund', restore_amount, restore_amount,
                    NOW() + INTERVAL '24 hours', 'refund:' || charge_row.id || ':' || lot_id,
                    jsonb_build_object('chargeId', charge_row.id, 'originalLotId', lot_id)
                ) ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;

        UPDATE public.apple_charge_transactions
        SET refunded_at = NOW(), fair_use_expires_at = NOW()
        WHERE id = charge_row.id;
    ELSE
        UPDATE public.apple_charge_transactions
        SET settled_at = NOW(), fair_use_expires_at = NOW()
        WHERE id = charge_row.id;
    END IF;
    RETURN TRUE;
END;
$settle_apple_charge$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Compatibility path for an older application instance during rolling deployment.
CREATE OR REPLACE FUNCTION public.refund_user_apples(
    p_user_id UUID,
    p_count INTEGER DEFAULT 1
)
RETURNS TABLE (
    success BOOLEAN,
    user_id UUID,
    is_paid BOOLEAN,
    daily_apple_limit INTEGER,
    membership_expires_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER,
    bonus_expires_at TIMESTAMPTZ,
    apples_used_today INTEGER,
    last_reset_date DATE,
    remaining INTEGER
) AS $refund_user_apples$
BEGIN
    UPDATE public.user_quotas
    SET apples_used_today = GREATEST(0, apples_used_today - GREATEST(1, COALESCE(p_count, 1))), updated_at = NOW()
    WHERE user_quotas.user_id = p_user_id;

    RETURN QUERY
    SELECT
        TRUE,
        q.user_id,
        q.is_paid,
        q.daily_apple_limit,
        q.membership_expires_at,
        q.bonus_apple_limit,
        q.bonus_expires_at,
        q.apples_used_today,
        q.last_reset_date,
        GREATEST(0, q.daily_apple_limit + COALESCE(q.bonus_apple_limit, 0) - q.apples_used_today)
    FROM public.user_quotas q
    WHERE q.user_id = p_user_id;
END;
$refund_user_apples$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.apply_user_benefits(
    p_user_id UUID,
    p_membership_days INTEGER DEFAULT 0,
    p_bonus_apple_limit INTEGER DEFAULT 0,
    p_bonus_days INTEGER DEFAULT 0
)
RETURNS TABLE (
    membership_expires_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER,
    bonus_expires_at TIMESTAMPTZ
) AS $apply_user_benefits$
DECLARE
    quota_row public.user_quotas%ROWTYPE;
    safe_membership_days INTEGER := GREATEST(0, COALESCE(p_membership_days, 0));
    safe_bonus_limit INTEGER := GREATEST(0, COALESCE(p_bonus_apple_limit, 0));
    safe_bonus_days INTEGER := GREATEST(0, COALESCE(p_bonus_days, 0));
    bonus_base TIMESTAMPTZ;
BEGIN
    IF safe_membership_days > 0 THEN
        PERFORM public.grant_membership_entitlement(
            p_user_id, 'plus', safe_membership_days,
            'legacy-reward-' || safe_membership_days, 'legacy_reward'
        );
    END IF;

    INSERT INTO public.user_quotas (
        user_id, is_paid, daily_apple_limit, membership_tier,
        apples_used_today, last_reset_date
    ) VALUES (
        p_user_id, FALSE, 5, 'free', 0,
        (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE
    ) ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO quota_row
    FROM public.user_quotas
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF safe_bonus_limit > 0 AND safe_bonus_days > 0 THEN
        bonus_base := CASE
            WHEN quota_row.bonus_expires_at IS NOT NULL AND quota_row.bonus_expires_at > NOW()
                THEN quota_row.bonus_expires_at
            ELSE NOW()
        END;
        quota_row.bonus_apple_limit := CASE
            WHEN quota_row.bonus_expires_at IS NOT NULL AND quota_row.bonus_expires_at > NOW()
                THEN COALESCE(quota_row.bonus_apple_limit, 0) + safe_bonus_limit
            ELSE safe_bonus_limit
        END;
        quota_row.bonus_expires_at := bonus_base + make_interval(days => safe_bonus_days);

        UPDATE public.user_quotas
        SET
            bonus_apple_limit = quota_row.bonus_apple_limit,
            bonus_expires_at = quota_row.bonus_expires_at,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;

    RETURN QUERY SELECT
        q.membership_expires_at,
        q.bonus_apple_limit,
        q.bonus_expires_at
    FROM public.user_quotas q
    WHERE q.user_id = p_user_id;
END;
$apply_user_benefits$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.redeem_redemption_code(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.redeem_redemption_code(
    p_user_id UUID,
    p_code TEXT
)
RETURNS TABLE (
    ok BOOLEAN,
    status INTEGER,
    message TEXT,
    code TEXT,
    membership_tier TEXT,
    membership_expires_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER,
    bonus_expires_at TIMESTAMPTZ,
    apple_wallet_balance INTEGER,
    apple_wallet_expires_at TIMESTAMPTZ
) AS $redeem_redemption_code$
DECLARE
    normalized_code TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
    code_row public.redemption_codes%ROWTYPE;
    quota_row public.user_quotas%ROWTYPE;
    wallet_row RECORD;
BEGIN
    IF normalized_code = '' THEN
        RETURN QUERY SELECT FALSE, 400, '请输入兑换码', NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT * INTO code_row
    FROM public.redemption_codes
    WHERE redemption_codes.code = normalized_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 404, '兑换码不存在', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF NOT code_row.is_active OR code_row.starts_at > NOW()
        OR (code_row.expires_at IS NOT NULL AND code_row.expires_at <= NOW()) THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码未启用或已过期', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF code_row.max_redemptions IS NOT NULL AND code_row.redeemed_count >= code_row.max_redemptions THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码已达到使用上限', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.redemption_redemptions
        WHERE redemption_redemptions.code = normalized_code
          AND redemption_redemptions.user_id = p_user_id
    ) THEN
        RETURN QUERY SELECT FALSE, 409, '你已经兑换过这个兑换码', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF COALESCE(code_row.membership_days, 0) <= 0
        AND NOT (COALESCE(code_row.bonus_apple_limit, 0) > 0 AND COALESCE(code_row.bonus_days, 0) > 0)
        AND COALESCE(code_row.apple_amount, 0) <= 0 THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码没有配置可发放的权益', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    INSERT INTO public.redemption_redemptions (
        code, user_id, applied_membership_days, applied_membership_tier,
        applied_bonus_apple_limit, applied_bonus_days, applied_apple_amount
    ) VALUES (
        normalized_code, p_user_id, COALESCE(code_row.membership_days, 0),
        CASE WHEN code_row.membership_days > 0 THEN code_row.membership_tier ELSE NULL END,
        COALESCE(code_row.bonus_apple_limit, 0), COALESCE(code_row.bonus_days, 0),
        COALESCE(code_row.apple_amount, 0)
    );

    IF COALESCE(code_row.membership_days, 0) > 0 THEN
        PERFORM public.grant_membership_entitlement(
            p_user_id,
            code_row.membership_tier,
            code_row.membership_days,
            'redemption-' || normalized_code,
            'redemption',
            'redeem:' || normalized_code || ':' || p_user_id
        );
    END IF;

    IF COALESCE(code_row.bonus_apple_limit, 0) > 0 AND COALESCE(code_row.bonus_days, 0) > 0 THEN
        PERFORM public.apply_user_benefits(p_user_id, 0, code_row.bonus_apple_limit, code_row.bonus_days);
    END IF;

    IF COALESCE(code_row.apple_amount, 0) > 0 THEN
        SELECT * INTO wallet_row
        FROM public.grant_apple_wallet(
            p_user_id,
            code_row.apple_amount,
            code_row.apple_expiry_days,
            'redemption-' || normalized_code,
            'redemption',
            'redeem:' || normalized_code || ':' || p_user_id
        );
        UPDATE public.redemption_redemptions
        SET applied_wallet_expires_at = wallet_row.expires_at
        WHERE redemption_redemptions.code = normalized_code
          AND redemption_redemptions.user_id = p_user_id;
    END IF;

    UPDATE public.redemption_codes
    SET redeemed_count = redeemed_count + 1
    WHERE redemption_codes.code = normalized_code;

    SELECT * INTO quota_row FROM public.user_quotas WHERE user_id = p_user_id;
    RETURN QUERY SELECT
        TRUE,
        200,
        '兑换成功，权益已经发放',
        normalized_code,
        COALESCE(quota_row.membership_tier, 'free'),
        quota_row.membership_expires_at,
        COALESCE(quota_row.bonus_apple_limit, 0),
        quota_row.bonus_expires_at,
        COALESCE((SELECT SUM(remaining_amount)::INTEGER FROM public.apple_wallet_lots
            WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW()), 0),
        (SELECT MIN(expires_at) FROM public.apple_wallet_lots
            WHERE user_id = p_user_id AND remaining_amount > 0 AND expires_at > NOW());
EXCEPTION
    WHEN unique_violation THEN
        RETURN QUERY SELECT FALSE, 409, '你已经兑换过这个兑换码', normalized_code, NULL::TEXT, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ, 0, NULL::TIMESTAMPTZ;
END;
$redeem_redemption_code$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.grant_membership_entitlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_apple_wallet(UUID, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_apple_charge(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_user_apples(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_user_benefits(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_redemption_code(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_membership_entitlement(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_apple_wallet(UUID, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_apple_charge(UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_apples(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_user_benefits(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_redemption_code(UUID, TEXT) TO service_role;

-- Admin updates to user_quotas are authoritative while the selected membership
-- tier is active. Recreate the function explicitly so this migration does not
-- depend on the formatting of the function currently deployed in Supabase.

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
    ) ON CONFLICT ON CONSTRAINT user_quotas_pkey DO NOTHING;

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

    -- Keep the Admin-managed base quota while the stored tier is still active.
    -- Only a real tier transition (for example, membership expiry) restores
    -- the destination plan's default base quota.
    effective_daily_limit := CASE
        WHEN effective_tier IS DISTINCT FROM COALESCE(quota_row.membership_tier, 'free')
            THEN CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END
        ELSE GREATEST(
            0,
            COALESCE(
                quota_row.daily_apple_limit,
                CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END
            )
        )
    END + CASE WHEN bonus_active THEN COALESCE(quota_row.bonus_apple_limit, 0) ELSE 0 END;
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
          AND apple_charge_transactions.membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND settled_at IS NULL
          AND refunded_at IS NULL
          AND fair_use_expires_at > now_value;

        SELECT COUNT(*)::INTEGER INTO hour_count
        FROM public.apple_charge_transactions
        WHERE apple_charge_transactions.user_id = p_user_id
          AND apple_charge_transactions.membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND created_at > now_value - INTERVAL '1 hour';

        SELECT COUNT(*)::INTEGER INTO day_count
        FROM public.apple_charge_transactions
        WHERE apple_charge_transactions.user_id = p_user_id
          AND apple_charge_transactions.membership_tier = 'ultra'
          AND fair_use_enforced = TRUE
          AND created_at > now_value - INTERVAL '24 hours';

        IF active_count >= 1 OR hour_count >= 60 OR day_count >= 300 THEN
            IF active_count < 1 AND hour_count >= 60 THEN
                SELECT MIN(created_at) + INTERVAL '1 hour' INTO retry_at
                FROM public.apple_charge_transactions
                WHERE apple_charge_transactions.user_id = p_user_id
                  AND apple_charge_transactions.membership_tier = 'ultra'
                  AND fair_use_enforced = TRUE
                  AND created_at > now_value - INTERVAL '1 hour';
            ELSIF active_count < 1 AND day_count >= 300 THEN
                SELECT MIN(created_at) + INTERVAL '24 hours' INTO retry_at
                FROM public.apple_charge_transactions
                WHERE apple_charge_transactions.user_id = p_user_id
                  AND apple_charge_transactions.membership_tier = 'ultra'
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

    quota_row.daily_apple_limit := CASE
        WHEN effective_tier IS DISTINCT FROM COALESCE(quota_row.membership_tier, 'free')
            THEN CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END
        ELSE GREATEST(
            0,
            COALESCE(
                quota_row.daily_apple_limit,
                CASE WHEN effective_tier = 'plus' THEN 30 ELSE 5 END
            )
        )
    END;
    quota_row.membership_tier := effective_tier;
    quota_row.is_paid := effective_tier <> 'free';
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

REVOKE EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER, BOOLEAN, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER, BOOLEAN, TEXT)
TO service_role;

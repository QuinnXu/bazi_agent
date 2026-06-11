-- Quota performance helpers: reset, consume, and refund in one locked DB round-trip.
-- Use named dollar quotes so this file is safer to paste into Supabase SQL Editor.

DROP FUNCTION IF EXISTS public.consume_user_apples(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.consume_user_apples(
    p_user_id UUID,
    p_count INTEGER DEFAULT 0
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
) AS $consume_user_apples$
DECLARE
    quota_row RECORD;
    today_key DATE := CURRENT_DATE;
    safe_count INTEGER := GREATEST(0, COALESCE(p_count, 0));
    membership_active BOOLEAN;
    bonus_active BOOLEAN;
    effective_limit INTEGER;
BEGIN
    INSERT INTO public.user_quotas (
        user_id,
        is_paid,
        daily_apple_limit,
        membership_expires_at,
        bonus_apple_limit,
        bonus_expires_at,
        apples_used_today,
        last_reset_date
    )
    VALUES (p_user_id, FALSE, 5, NULL, 0, NULL, 0, today_key)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT *
    INTO quota_row
    FROM public.user_quotas
    WHERE user_quotas.user_id = p_user_id
    FOR UPDATE;

    IF quota_row.is_paid AND quota_row.membership_expires_at IS NOT NULL AND quota_row.membership_expires_at <= NOW() THEN
        quota_row.is_paid := FALSE;
        quota_row.daily_apple_limit := 5;
    END IF;

    IF COALESCE(quota_row.bonus_apple_limit, 0) > 0
        AND quota_row.bonus_expires_at IS NOT NULL
        AND quota_row.bonus_expires_at <= NOW() THEN
        quota_row.bonus_apple_limit := 0;
    END IF;

    IF quota_row.last_reset_date IS DISTINCT FROM today_key THEN
        quota_row.apples_used_today := 0;
        quota_row.last_reset_date := today_key;
    END IF;

    membership_active := quota_row.is_paid AND (
        quota_row.membership_expires_at IS NULL OR quota_row.membership_expires_at > NOW()
    );
    bonus_active := COALESCE(quota_row.bonus_apple_limit, 0) > 0
        AND quota_row.bonus_expires_at IS NOT NULL
        AND quota_row.bonus_expires_at > NOW();

    effective_limit := CASE
        WHEN membership_active THEN GREATEST(COALESCE(quota_row.daily_apple_limit, 5), 999)
        ELSE COALESCE(quota_row.daily_apple_limit, 5)
    END + CASE WHEN bonus_active THEN COALESCE(quota_row.bonus_apple_limit, 0) ELSE 0 END;

    IF safe_count > 0 AND effective_limit - COALESCE(quota_row.apples_used_today, 0) < safe_count THEN
        success := FALSE;
    ELSE
        success := TRUE;
        quota_row.apples_used_today := COALESCE(quota_row.apples_used_today, 0) + safe_count;
    END IF;

    UPDATE public.user_quotas
    SET
        is_paid = quota_row.is_paid,
        daily_apple_limit = quota_row.daily_apple_limit,
        membership_expires_at = quota_row.membership_expires_at,
        bonus_apple_limit = COALESCE(quota_row.bonus_apple_limit, 0),
        bonus_expires_at = quota_row.bonus_expires_at,
        apples_used_today = quota_row.apples_used_today,
        last_reset_date = quota_row.last_reset_date,
        updated_at = NOW()
    WHERE user_quotas.user_id = p_user_id
    RETURNING
        user_quotas.user_id,
        user_quotas.is_paid,
        user_quotas.daily_apple_limit,
        user_quotas.membership_expires_at,
        user_quotas.bonus_apple_limit,
        user_quotas.bonus_expires_at,
        user_quotas.apples_used_today,
        user_quotas.last_reset_date
    INTO
        consume_user_apples.user_id,
        consume_user_apples.is_paid,
        consume_user_apples.daily_apple_limit,
        consume_user_apples.membership_expires_at,
        consume_user_apples.bonus_apple_limit,
        consume_user_apples.bonus_expires_at,
        consume_user_apples.apples_used_today,
        consume_user_apples.last_reset_date;

    remaining := GREATEST(0, effective_limit - consume_user_apples.apples_used_today);
    RETURN NEXT;
END;
$consume_user_apples$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.refund_user_apples(UUID, INTEGER);

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
DECLARE
    quota_row RECORD;
    safe_count INTEGER := GREATEST(1, COALESCE(p_count, 1));
    membership_active BOOLEAN;
    bonus_active BOOLEAN;
    effective_limit INTEGER;
BEGIN
    SELECT *
    INTO quota_row
    FROM public.user_quotas
    WHERE user_quotas.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT * FROM public.consume_user_apples(p_user_id, 0);
        RETURN;
    END IF;

    quota_row.apples_used_today := GREATEST(0, COALESCE(quota_row.apples_used_today, 0) - safe_count);

    membership_active := quota_row.is_paid AND (
        quota_row.membership_expires_at IS NULL OR quota_row.membership_expires_at > NOW()
    );
    bonus_active := COALESCE(quota_row.bonus_apple_limit, 0) > 0
        AND quota_row.bonus_expires_at IS NOT NULL
        AND quota_row.bonus_expires_at > NOW();

    effective_limit := CASE
        WHEN membership_active THEN GREATEST(COALESCE(quota_row.daily_apple_limit, 5), 999)
        ELSE COALESCE(quota_row.daily_apple_limit, 5)
    END + CASE WHEN bonus_active THEN COALESCE(quota_row.bonus_apple_limit, 0) ELSE 0 END;

    UPDATE public.user_quotas
    SET
        apples_used_today = quota_row.apples_used_today,
        updated_at = NOW()
    WHERE user_quotas.user_id = p_user_id
    RETURNING
        TRUE,
        user_quotas.user_id,
        user_quotas.is_paid,
        user_quotas.daily_apple_limit,
        user_quotas.membership_expires_at,
        user_quotas.bonus_apple_limit,
        user_quotas.bonus_expires_at,
        user_quotas.apples_used_today,
        user_quotas.last_reset_date,
        GREATEST(0, effective_limit - user_quotas.apples_used_today)
    INTO
        refund_user_apples.success,
        refund_user_apples.user_id,
        refund_user_apples.is_paid,
        refund_user_apples.daily_apple_limit,
        refund_user_apples.membership_expires_at,
        refund_user_apples.bonus_apple_limit,
        refund_user_apples.bonus_expires_at,
        refund_user_apples.apples_used_today,
        refund_user_apples.last_reset_date,
        refund_user_apples.remaining;

    RETURN NEXT;
END;
$refund_user_apples$ LANGUAGE plpgsql SECURITY DEFINER;

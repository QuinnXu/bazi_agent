-- Referral growth V2: first-touch attribution, staged apple rewards, and funnel tracking.
-- Existing rewarded referrals remain on the legacy membership policy.

ALTER TABLE public.apple_wallet_lots
    DROP CONSTRAINT IF EXISTS apple_wallet_lots_source_check;
ALTER TABLE public.apple_wallet_lots
    ADD CONSTRAINT apple_wallet_lots_source_check
        CHECK (source IN ('legacy', 'ottpay', 'redemption', 'referral', 'admin', 'refund'));

CREATE TABLE IF NOT EXISTS public.referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'link' CHECK (source IN ('link', 'manual')),
    clicked_at TIMESTAMPTZ,
    trial_started_at TIMESTAMPTZ,
    trial_completed_at TIMESTAMPTZ,
    referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    registered_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer_funnel
    ON public.referral_attributions(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_code_created
    ON public.referral_attributions(referral_code, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_referred_user
    ON public.referral_attributions(referred_user_id)
    WHERE referred_user_id IS NOT NULL;

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_attributions FROM anon, authenticated;
GRANT ALL ON public.referral_attributions TO service_role;

DROP TRIGGER IF EXISTS update_referral_attributions_updated_at ON public.referral_attributions;
CREATE TRIGGER update_referral_attributions_updated_at
    BEFORE UPDATE ON public.referral_attributions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.referrals
    ADD COLUMN IF NOT EXISTS attribution_id UUID REFERENCES public.referral_attributions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reward_policy_version TEXT NOT NULL DEFAULT 'legacy_membership_v1',
    ADD COLUMN IF NOT EXISTS new_user_reward_apples INTEGER NOT NULL DEFAULT 0 CHECK (new_user_reward_apples >= 0),
    ADD COLUMN IF NOT EXISTS referrer_reward_apples INTEGER NOT NULL DEFAULT 0 CHECK (referrer_reward_apples >= 0),
    ADD COLUMN IF NOT EXISTS reward_expiry_days INTEGER NOT NULL DEFAULT 0 CHECK (reward_expiry_days >= 0),
    ADD COLUMN IF NOT EXISTS new_user_rewarded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS referrer_rewarded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_attribution
    ON public.referrals(attribution_id)
    WHERE attribution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_pending_activation
    ON public.referrals(referred_user_id, created_at)
    WHERE status = 'pending';

DROP FUNCTION IF EXISTS public.settle_referral_reward(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.settle_referral_reward(
    p_referred_user_id UUID,
    p_referral_code TEXT DEFAULT NULL,
    p_attribution_id UUID DEFAULT NULL
)
RETURNS TABLE (
    referral_applied BOOLEAN,
    reason TEXT,
    referral_code TEXT,
    referrer_user_id UUID,
    new_user_reward_apples INTEGER,
    referrer_reward_apples INTEGER,
    reward_expiry_days INTEGER,
    new_user_reward_expires_at TIMESTAMPTZ,
    referrer_reward_pending BOOLEAN
) AS $settle_referral_reward$
DECLARE
    normalized_code TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_referral_code, ''), '[^A-Za-z0-9]', '', 'g'));
    referrer_profile public.profiles%ROWTYPE;
    referred_profile public.profiles%ROWTYPE;
    referral_row public.referrals%ROWTYPE;
    attribution_row public.referral_attributions%ROWTYPE;
    wallet_row RECORD;
    now_value TIMESTAMPTZ := NOW();
    reward_amount CONSTANT INTEGER := 30;
    reward_days CONSTANT INTEGER := 365;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_referred_user_id::TEXT, 0));

    SELECT * INTO referred_profile
    FROM public.profiles
    WHERE id = p_referred_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'missing_profile', NULL::TEXT, NULL::UUID,
            NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    SELECT * INTO referral_row
    FROM public.referrals
    WHERE referred_user_id = p_referred_user_id
    FOR UPDATE;

    IF FOUND THEN
        IF referral_row.reward_policy_version = 'apple_v2' THEN
            SELECT * INTO wallet_row
            FROM public.grant_apple_wallet(
                referral_row.referred_user_id,
                referral_row.new_user_reward_apples,
                referral_row.reward_expiry_days,
                'referral-invitee-apple-v2',
                'referral',
                'referral:' || referral_row.id::TEXT || ':invitee',
                jsonb_build_object(
                    'referral_id', referral_row.id,
                    'role', 'invitee',
                    'policy', referral_row.reward_policy_version
                )
            );

            UPDATE public.referrals
            SET new_user_rewarded_at = COALESCE(new_user_rewarded_at, now_value)
            WHERE id = referral_row.id
            RETURNING * INTO referral_row;

            RETURN QUERY SELECT TRUE, 'already_bound', referral_row.referral_code,
                referral_row.referrer_user_id, referral_row.new_user_reward_apples,
                referral_row.referrer_reward_apples, referral_row.reward_expiry_days,
                wallet_row.expires_at::TIMESTAMPTZ,
                referral_row.referrer_rewarded_at IS NULL;
            RETURN;
        END IF;

        RETURN QUERY SELECT FALSE, 'already_bound', referral_row.referral_code,
            referral_row.referrer_user_id, NULL::INTEGER, NULL::INTEGER,
            NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    IF referred_profile.referred_by IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'already_bound', normalized_code,
            referred_profile.referred_by, NULL::INTEGER, NULL::INTEGER,
            NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    IF p_attribution_id IS NOT NULL THEN
        SELECT * INTO attribution_row
        FROM public.referral_attributions
        WHERE id = p_attribution_id
          AND expires_at > now_value
          AND (referred_user_id IS NULL OR referred_user_id = p_referred_user_id)
        FOR UPDATE;

        IF FOUND THEN
            normalized_code := attribution_row.referral_code;
        END IF;
    END IF;

    IF normalized_code = '' THEN
        RETURN QUERY SELECT FALSE, 'none', NULL::TEXT, NULL::UUID,
            NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    SELECT * INTO referrer_profile
    FROM public.profiles
    WHERE profiles.referral_code = normalized_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'invalid_code', normalized_code, NULL::UUID,
            NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    IF referrer_profile.id = p_referred_user_id THEN
        RETURN QUERY SELECT FALSE, 'self_referral', normalized_code, NULL::UUID,
            NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::TIMESTAMPTZ, FALSE;
        RETURN;
    END IF;

    IF p_attribution_id IS NULL OR attribution_row.id IS NULL THEN
        INSERT INTO public.referral_attributions (
            referrer_user_id, referral_code, source, referred_user_id,
            registered_at, expires_at
        ) VALUES (
            referrer_profile.id, COALESCE(referrer_profile.referral_code, normalized_code),
            'manual', p_referred_user_id, now_value, now_value + INTERVAL '30 days'
        )
        RETURNING * INTO attribution_row;
    ELSE
        UPDATE public.referral_attributions
        SET referred_user_id = p_referred_user_id,
            registered_at = COALESCE(registered_at, now_value)
        WHERE id = attribution_row.id
        RETURNING * INTO attribution_row;
    END IF;

    INSERT INTO public.referrals (
        referrer_user_id, referred_user_id, referral_code, attribution_id,
        status, reward_policy_version,
        new_user_reward_membership_days, referrer_reward_membership_days,
        new_user_reward_apples, referrer_reward_apples, reward_expiry_days,
        reward_note, created_at, rewarded_at
    ) VALUES (
        referrer_profile.id, p_referred_user_id,
        COALESCE(referrer_profile.referral_code, normalized_code), attribution_row.id,
        'pending', 'apple_v2', 0, 0,
        reward_amount, reward_amount, reward_days,
        '新用户已获得 30 个 365 天苹果；邀请人待新用户完成首次完整回答后获得 30 个 365 天苹果',
        now_value, NULL
    )
    RETURNING * INTO referral_row;

    UPDATE public.profiles
    SET referred_by = referral_row.referrer_user_id,
        referral_bound_at = COALESCE(referral_bound_at, now_value)
    WHERE id = p_referred_user_id;

    SELECT * INTO wallet_row
    FROM public.grant_apple_wallet(
        referral_row.referred_user_id,
        reward_amount,
        reward_days,
        'referral-invitee-apple-v2',
        'referral',
        'referral:' || referral_row.id::TEXT || ':invitee',
        jsonb_build_object(
            'referral_id', referral_row.id,
            'role', 'invitee',
            'policy', 'apple_v2'
        )
    );

    UPDATE public.referrals
    SET new_user_rewarded_at = now_value
    WHERE id = referral_row.id
    RETURNING * INTO referral_row;

    RETURN QUERY SELECT TRUE, NULL::TEXT, referral_row.referral_code,
        referral_row.referrer_user_id, reward_amount, reward_amount, reward_days,
        wallet_row.expires_at::TIMESTAMPTZ, TRUE;
END;
$settle_referral_reward$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.activate_referral_reward(
    p_referred_user_id UUID
)
RETURNS TABLE (
    activated BOOLEAN,
    referral_id UUID,
    referrer_user_id UUID,
    referrer_reward_apples INTEGER,
    reward_expires_at TIMESTAMPTZ
) AS $activate_referral_reward$
DECLARE
    referral_row public.referrals%ROWTYPE;
    wallet_row RECORD;
    now_value TIMESTAMPTZ := NOW();
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_referred_user_id::TEXT, 0));

    SELECT * INTO referral_row
    FROM public.referrals
    WHERE referred_user_id = p_referred_user_id
      AND reward_policy_version = 'apple_v2'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF referral_row.referrer_rewarded_at IS NOT NULL THEN
        SELECT expires_at INTO reward_expires_at
        FROM public.apple_wallet_lots
        WHERE source = 'referral'
          AND external_order_id = 'referral:' || referral_row.id::TEXT || ':referrer';

        RETURN QUERY SELECT FALSE, referral_row.id, referral_row.referrer_user_id,
            referral_row.referrer_reward_apples, reward_expires_at;
        RETURN;
    END IF;

    SELECT * INTO wallet_row
    FROM public.grant_apple_wallet(
        referral_row.referrer_user_id,
        referral_row.referrer_reward_apples,
        referral_row.reward_expiry_days,
        'referral-referrer-apple-v2',
        'referral',
        'referral:' || referral_row.id::TEXT || ':referrer',
        jsonb_build_object(
            'referral_id', referral_row.id,
            'role', 'referrer',
            'policy', referral_row.reward_policy_version,
            'activated_by_user_id', p_referred_user_id
        )
    );

    UPDATE public.referrals
    SET status = 'rewarded',
        activated_at = COALESCE(activated_at, now_value),
        referrer_rewarded_at = now_value,
        rewarded_at = now_value
    WHERE id = referral_row.id;

    IF referral_row.attribution_id IS NOT NULL THEN
        UPDATE public.referral_attributions
        SET activated_at = COALESCE(activated_at, now_value)
        WHERE id = referral_row.attribution_id;
    END IF;

    RETURN QUERY SELECT TRUE, referral_row.id, referral_row.referrer_user_id,
        referral_row.referrer_reward_apples, wallet_row.expires_at::TIMESTAMPTZ;
END;
$activate_referral_reward$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.settle_referral_reward(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_referral_reward(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_referral_reward(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_referral_reward(UUID) TO service_role;

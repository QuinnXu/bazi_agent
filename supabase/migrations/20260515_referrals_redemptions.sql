-- Referral rewards, redemption codes, and membership-period support.

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    candidate TEXT;
BEGIN
    LOOP
        candidate := 'BB' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.profiles WHERE referral_code = candidate
        );
    END LOOP;
    RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT,
    ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referral_bound_at TIMESTAMPTZ;

ALTER TABLE public.profiles
    ALTER COLUMN referral_code SET DEFAULT public.generate_referral_code();

UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL OR referral_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'rewarded' CHECK (status IN ('pending', 'rewarded', 'rejected')),
    new_user_reward_membership_days INTEGER DEFAULT 7 CHECK (new_user_reward_membership_days >= 0),
    referrer_reward_membership_days INTEGER DEFAULT 7 CHECK (referrer_reward_membership_days >= 0),
    reward_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rewarded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT referrals_no_self_referral CHECK (referrer_user_id <> referred_user_id),
    CONSTRAINT referrals_referred_user_unique UNIQUE (referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own referral relationships" ON public.referrals;
CREATE POLICY "Users can view own referral relationships"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS bonus_apple_limit INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_quotas_membership_expires ON public.user_quotas(membership_expires_at);

CREATE TABLE IF NOT EXISTS public.redemption_codes (
    code TEXT PRIMARY KEY,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'membership_days'
        CHECK (kind IN ('membership_days', 'bonus_quota', 'combo')),
    membership_days INTEGER DEFAULT 0 CHECK (membership_days >= 0),
    bonus_apple_limit INTEGER DEFAULT 0 CHECK (bonus_apple_limit >= 0),
    bonus_days INTEGER DEFAULT 0 CHECK (bonus_days >= 0),
    max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    redeemed_count INTEGER DEFAULT 0 CHECK (redeemed_count >= 0),
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.redemption_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL REFERENCES public.redemption_codes(code) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    applied_membership_days INTEGER DEFAULT 0 CHECK (applied_membership_days >= 0),
    applied_bonus_apple_limit INTEGER DEFAULT 0 CHECK (applied_bonus_apple_limit >= 0),
    applied_bonus_days INTEGER DEFAULT 0 CHECK (applied_bonus_days >= 0),
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT redemption_redemptions_code_user_unique UNIQUE (code, user_id)
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_active ON public.redemption_codes(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_redemption_redemptions_user ON public.redemption_redemptions(user_id, redeemed_at DESC);

ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redemption history" ON public.redemption_redemptions;
CREATE POLICY "Users can view own redemption history"
    ON public.redemption_redemptions FOR SELECT
    USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_redemption_codes_updated_at ON public.redemption_codes;
CREATE TRIGGER update_redemption_codes_updated_at
    BEFORE UPDATE ON public.redemption_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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
) AS $$
DECLARE
    quota_row RECORD;
    today_key DATE := CURRENT_DATE;
    safe_membership_days INTEGER := GREATEST(0, COALESCE(p_membership_days, 0));
    safe_bonus_limit INTEGER := GREATEST(0, COALESCE(p_bonus_apple_limit, 0));
    safe_bonus_days INTEGER := GREATEST(0, COALESCE(p_bonus_days, 0));
    membership_base TIMESTAMPTZ;
    bonus_base TIMESTAMPTZ;
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
    VALUES (
        p_user_id,
        FALSE,
        5,
        NULL,
        0,
        NULL,
        0,
        today_key
    )
    ON CONFLICT (user_id) DO NOTHING;

    SELECT *
    INTO quota_row
    FROM public.user_quotas
    WHERE user_quotas.user_id = p_user_id
    FOR UPDATE;

    IF safe_membership_days > 0 THEN
        membership_base := CASE
            WHEN quota_row.membership_expires_at IS NOT NULL AND quota_row.membership_expires_at > NOW()
                THEN quota_row.membership_expires_at
            ELSE NOW()
        END;

        quota_row.membership_expires_at := membership_base + (safe_membership_days || ' days')::INTERVAL;
        quota_row.is_paid := TRUE;
        quota_row.daily_apple_limit := GREATEST(COALESCE(quota_row.daily_apple_limit, 5), 999);
    END IF;

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
        quota_row.bonus_expires_at := bonus_base + (safe_bonus_days || ' days')::INTERVAL;
    END IF;

    UPDATE public.user_quotas
    SET
        is_paid = quota_row.is_paid,
        daily_apple_limit = quota_row.daily_apple_limit,
        membership_expires_at = quota_row.membership_expires_at,
        bonus_apple_limit = COALESCE(quota_row.bonus_apple_limit, 0),
        bonus_expires_at = quota_row.bonus_expires_at,
        updated_at = NOW()
    WHERE user_quotas.user_id = p_user_id
    RETURNING
        user_quotas.membership_expires_at,
        user_quotas.bonus_apple_limit,
        user_quotas.bonus_expires_at
    INTO
        apply_user_benefits.membership_expires_at,
        apply_user_benefits.bonus_apple_limit,
        apply_user_benefits.bonus_expires_at;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.settle_referral_reward(
    p_referred_user_id UUID,
    p_referral_code TEXT
)
RETURNS TABLE (
    referral_applied BOOLEAN,
    reason TEXT,
    referral_code TEXT,
    referrer_user_id UUID,
    new_user_reward_days INTEGER,
    referrer_reward_days INTEGER
) AS $$
DECLARE
    normalized_code TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_referral_code, ''), '[^A-Za-z0-9]', '', 'g'));
    referrer_profile public.profiles%ROWTYPE;
    referred_profile public.profiles%ROWTYPE;
    referral_row public.referrals%ROWTYPE;
    now_value TIMESTAMPTZ := NOW();
    reward_note_text TEXT := '新用户奖励 7 天会员；推荐人奖励 7 天会员';
BEGIN
    IF normalized_code = '' THEN
        RETURN QUERY SELECT FALSE, 'none', NULL::TEXT, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT *
    INTO referred_profile
    FROM public.profiles
    WHERE id = p_referred_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'missing_profile', normalized_code, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT *
    INTO referral_row
    FROM public.referrals
    WHERE referred_user_id = p_referred_user_id
    FOR UPDATE;

    IF FOUND THEN
        IF referral_row.status = 'pending' THEN
            PERFORM public.apply_user_benefits(
                referral_row.referred_user_id,
                referral_row.new_user_reward_membership_days,
                0,
                0
            );
            PERFORM public.apply_user_benefits(
                referral_row.referrer_user_id,
                referral_row.referrer_reward_membership_days,
                0,
                0
            );

            UPDATE public.referrals
            SET
                status = 'rewarded',
                rewarded_at = now_value,
                reward_note = reward_note_text
            WHERE id = referral_row.id
            RETURNING * INTO referral_row;

            UPDATE public.profiles
            SET
                referred_by = referral_row.referrer_user_id,
                referral_bound_at = COALESCE(referral_bound_at, now_value)
            WHERE id = p_referred_user_id;

            RETURN QUERY SELECT
                TRUE,
                NULL::TEXT,
                referral_row.referral_code,
                referral_row.referrer_user_id,
                referral_row.new_user_reward_membership_days,
                referral_row.referrer_reward_membership_days;
            RETURN;
        END IF;

        RETURN QUERY SELECT FALSE, 'already_bound', normalized_code, referral_row.referrer_user_id, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    IF referred_profile.referred_by IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, 'already_bound', normalized_code, referred_profile.referred_by, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT *
    INTO referrer_profile
    FROM public.profiles
    WHERE profiles.referral_code = normalized_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'invalid_code', normalized_code, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    IF referrer_profile.id = p_referred_user_id THEN
        RETURN QUERY SELECT FALSE, 'self_referral', normalized_code, NULL::UUID, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    INSERT INTO public.referrals (
        referrer_user_id,
        referred_user_id,
        referral_code,
        status,
        new_user_reward_membership_days,
        referrer_reward_membership_days,
        created_at,
        rewarded_at
    )
    VALUES (
        referrer_profile.id,
        p_referred_user_id,
        COALESCE(referrer_profile.referral_code, normalized_code),
        'pending',
        7,
        7,
        now_value,
        NULL
    )
    ON CONFLICT (referred_user_id) DO NOTHING
    RETURNING * INTO referral_row;

    IF referral_row.id IS NULL THEN
        SELECT *
        INTO referral_row
        FROM public.referrals
        WHERE referred_user_id = p_referred_user_id
        FOR UPDATE;
    END IF;

    IF referral_row.status = 'pending' THEN
        UPDATE public.profiles
        SET
            referred_by = referral_row.referrer_user_id,
            referral_bound_at = COALESCE(referral_bound_at, now_value)
        WHERE id = p_referred_user_id;

        PERFORM public.apply_user_benefits(p_referred_user_id, 7, 0, 0);
        PERFORM public.apply_user_benefits(referral_row.referrer_user_id, 7, 0, 0);

        UPDATE public.referrals
        SET
            status = 'rewarded',
            rewarded_at = now_value,
            reward_note = reward_note_text
        WHERE id = referral_row.id
        RETURNING * INTO referral_row;

        RETURN QUERY SELECT
            TRUE,
            NULL::TEXT,
            referral_row.referral_code,
            referral_row.referrer_user_id,
            referral_row.new_user_reward_membership_days,
            referral_row.referrer_reward_membership_days;
        RETURN;
    END IF;

    RETURN QUERY SELECT FALSE, 'already_bound', normalized_code, referral_row.referrer_user_id, NULL::INTEGER, NULL::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.redeem_redemption_code(
    p_user_id UUID,
    p_code TEXT
)
RETURNS TABLE (
    ok BOOLEAN,
    status INTEGER,
    message TEXT,
    code TEXT,
    membership_expires_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER,
    bonus_expires_at TIMESTAMPTZ
) AS $$
DECLARE
    normalized_code TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
    code_row public.redemption_codes%ROWTYPE;
    benefit_row RECORD;
BEGIN
    IF normalized_code = '' THEN
        RETURN QUERY SELECT FALSE, 400, '请输入兑换码', NULL::TEXT, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT *
    INTO code_row
    FROM public.redemption_codes
    WHERE redemption_codes.code = normalized_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 404, '兑换码不存在', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF NOT code_row.is_active OR code_row.starts_at > NOW() OR (code_row.expires_at IS NOT NULL AND code_row.expires_at <= NOW()) THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码未启用或已过期', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF COALESCE(code_row.membership_days, 0) <= 0
        AND NOT (COALESCE(code_row.bonus_apple_limit, 0) > 0 AND COALESCE(code_row.bonus_days, 0) > 0) THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码没有配置可发放的权益', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF code_row.max_redemptions IS NOT NULL AND code_row.redeemed_count >= code_row.max_redemptions THEN
        RETURN QUERY SELECT FALSE, 400, '兑换码已达到使用上限', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.redemption_redemptions
        WHERE redemption_redemptions.code = normalized_code
          AND redemption_redemptions.user_id = p_user_id
    ) THEN
        RETURN QUERY SELECT FALSE, 409, '你已经兑换过这个兑换码', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    INSERT INTO public.redemption_redemptions (
        code,
        user_id,
        applied_membership_days,
        applied_bonus_apple_limit,
        applied_bonus_days
    )
    VALUES (
        normalized_code,
        p_user_id,
        COALESCE(code_row.membership_days, 0),
        COALESCE(code_row.bonus_apple_limit, 0),
        COALESCE(code_row.bonus_days, 0)
    );

    SELECT *
    INTO benefit_row
    FROM public.apply_user_benefits(
        p_user_id,
        COALESCE(code_row.membership_days, 0),
        COALESCE(code_row.bonus_apple_limit, 0),
        COALESCE(code_row.bonus_days, 0)
    );

    UPDATE public.redemption_codes
    SET redeemed_count = redeemed_count + 1
    WHERE redemption_codes.code = normalized_code;

    RETURN QUERY SELECT
        TRUE,
        200,
        '兑换成功，权益已经发放',
        normalized_code,
        benefit_row.membership_expires_at::TIMESTAMPTZ,
        benefit_row.bonus_apple_limit::INTEGER,
        benefit_row.bonus_expires_at::TIMESTAMPTZ;
EXCEPTION
    WHEN unique_violation THEN
        RETURN QUERY SELECT FALSE, 409, '你已经兑换过这个兑换码', normalized_code, NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

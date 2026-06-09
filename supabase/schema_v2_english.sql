-- ============================================
-- Supabase Database Schema (English Version)
-- ============================================
-- Purpose: Complete database structure for Bazi AI Chatbot
-- Language: English
-- Version: 2.0
-- Date: 2025-10-22
-- ============================================

-- ============================================
-- 1. Users Table (Extended from auth.users)
-- ============================================
-- Purpose: Store additional user profile information
-- Note: Core authentication is handled by Supabase auth.users

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    referral_code TEXT,
    referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    referral_bound_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referral code generation helper. Referral codes are intentionally
-- separate from promotion/redemption codes.
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

-- ============================================
-- 2. Bazi Profiles Table
-- ============================================
-- Purpose: Store multiple Bazi (birth chart) profiles per user
-- Each user can have multiple profiles (self, family, friends, etc.)

CREATE TABLE IF NOT EXISTS public.bazi_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Profile metadata
    profile_name TEXT NOT NULL,
    description TEXT,
    avatar_emoji TEXT DEFAULT '👤',
    
    -- Birth information
    birth_year INTEGER NOT NULL,
    birth_month INTEGER NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
    birth_day INTEGER NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
    birth_hour INTEGER NOT NULL CHECK (birth_hour BETWEEN 0 AND 23),
    birth_minute INTEGER NOT NULL CHECK (birth_minute BETWEEN 0 AND 59),
    
    -- Calendar type
    is_solar_calendar BOOLEAN DEFAULT TRUE,
    
    -- Personal information
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    
    -- Location information
    birth_longitude DECIMAL(10, 6) DEFAULT 121.5,
    birth_latitude DECIMAL(10, 6) DEFAULT 31.2,
    birth_location_name TEXT,
    
    -- Bazi calculation result (JSON or TEXT)
    bazi_result JSONB,
    bazi_result_text TEXT,
    
    -- Metadata
    is_favorite BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Chat Sessions Table
-- ============================================
-- Purpose: Manage chat conversations

CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Associated Bazi profile (optional, can chat without profile)
    bazi_profile_id UUID REFERENCES public.bazi_profiles(id) ON DELETE SET NULL,
    
    -- Session metadata
    title TEXT DEFAULT 'New Conversation',
    summary TEXT,
    mode TEXT DEFAULT 'classic' CHECK (mode IN ('classic', 'agent')),
    
    -- Session statistics
    message_count INTEGER DEFAULT 0,
    
    -- Session status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. Chat Messages Table
-- ============================================
-- Purpose: Store individual messages in conversations

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    
    -- Message content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    mode TEXT DEFAULT 'classic' CHECK (mode IN ('classic', 'agent')),
    
    -- Message metadata
    model TEXT,
    tokens_used INTEGER,
    
    -- Message status
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

-- Minimal dual-mode extension for existing deployments.
ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'classic' CHECK (mode IN ('classic', 'agent'));

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'classic' CHECK (mode IN ('classic', 'agent'));

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS model TEXT;

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS tokens_used INTEGER;

-- ============================================
-- 4b. LLM Usage Events Table
-- ============================================
-- Purpose: Track model/token consumption for every user request.

CREATE TABLE IF NOT EXISTS public.llm_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Request source and context
    source TEXT NOT NULL CHECK (source IN ('classic_chat', 'agent_planner', 'agent_analysis', 'feature_page', 'agent_tool')),
    mode TEXT NOT NULL CHECK (mode IN ('classic', 'agent', 'feature')),
    -- feature_kind is intentionally free-form; the application normalises
    -- it before insert (see lib/token-usage.ts), but new feature tags
    -- shouldn't require a schema migration.
    feature_kind TEXT,

    -- Model routing metadata
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'empty', 'aborted', 'failed')),

    -- Estimated token usage
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4c. Durable LLM Runs Tables
-- ============================================
-- Purpose: Keep long-running model work alive independently from browser
-- fetch/stream lifecycles and allow clients to poll/recover results.

CREATE TABLE IF NOT EXISTS public.llm_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    client_message_id TEXT,

    kind TEXT NOT NULL CHECK (kind IN ('classic_chat', 'agent_chat', 'feature_analyze')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    output_text TEXT NOT NULL DEFAULT '',
    final_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    assistant_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,

    model TEXT,
    task TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    apple_cost INTEGER NOT NULL DEFAULT 0 CHECK (apple_cost >= 0),
    quota_refunded BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.llm_run_events (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES public.llm_runs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    content TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, seq)
);

-- ============================================
-- 4d. Referrals Table
-- ============================================
-- Purpose: Bind one new user to one referrer and record the rewards granted.

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

-- ============================================
-- 4e. Redemption Codes Tables
-- ============================================
-- Purpose: Promotion codes generated by admins. These are separate from
-- referral codes and may grant membership days and/or temporary extra quota.

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

-- ============================================
-- 4e. Afdian Subscription Tables
-- ============================================
-- Purpose: Bind Afdian sponsors/orders to local users and grant membership.

CREATE TABLE IF NOT EXISTS public.afdian_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    afdian_user_id TEXT NOT NULL,
    user_private_id TEXT,
    binding_method TEXT NOT NULL DEFAULT 'oauth'
        CHECK (binding_method IN ('oauth', 'binding_code', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.afdian_binding_codes (
    code TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.afdian_plan_mappings (
    plan_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    membership_days INTEGER NOT NULL DEFAULT 30 CHECK (membership_days >= 0),
    bonus_apple_limit INTEGER NOT NULL DEFAULT 0 CHECK (bonus_apple_limit >= 0),
    bonus_days INTEGER NOT NULL DEFAULT 0 CHECK (bonus_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.afdian_orders (
    out_trade_no TEXT PRIMARY KEY,
    afdian_user_id TEXT,
    user_private_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    binding_code TEXT,
    plan_id TEXT,
    month INTEGER NOT NULL DEFAULT 1 CHECK (month > 0),
    total_amount NUMERIC(12, 2),
    show_amount NUMERIC(12, 2),
    status INTEGER,
    remark TEXT,
    raw JSONB NOT NULL DEFAULT '{}'::JSONB,
    process_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (process_status IN ('pending', 'processing', 'processed', 'unmatched', 'needs_mapping', 'ignored', 'failed')),
    error_message TEXT,
    applied_membership_days INTEGER NOT NULL DEFAULT 0 CHECK (applied_membership_days >= 0),
    applied_bonus_apple_limit INTEGER NOT NULL DEFAULT 0 CHECK (applied_bonus_apple_limit >= 0),
    applied_bonus_days INTEGER NOT NULL DEFAULT 0 CHECK (applied_bonus_days >= 0),
    processed_at TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. User Preferences Table (Optional)
-- ============================================
-- Purpose: Store user settings and preferences

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- UI preferences
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    language TEXT DEFAULT 'zh-CN',
    
    -- Notification preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    
    -- Privacy preferences
    data_collection_consent BOOLEAN DEFAULT FALSE,
    
    -- Preferences (JSON for flexibility)
    preferences JSONB DEFAULT '{}'::JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. Feedback Table (Optional)
-- ============================================
-- Purpose: Collect user feedback on AI responses

CREATE TABLE IF NOT EXISTS public.message_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    
    -- Feedback
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    feedback_type TEXT CHECK (feedback_type IN ('helpful', 'not_helpful', 'incorrect', 'offensive')),
    comment TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance Optimization
-- ============================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- Bazi Profiles indexes
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_user_id ON public.bazi_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_created_at ON public.bazi_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_is_favorite ON public.bazi_profiles(user_id, is_favorite) WHERE is_favorite = TRUE;

-- Chat Sessions indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_bazi_profile_id ON public.chat_sessions(bazi_profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON public.chat_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON public.chat_sessions(user_id, mode);

-- Chat Messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON public.chat_messages(session_id, role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_mode ON public.chat_messages(session_id, mode);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tokens ON public.chat_messages(session_id, tokens_used);

-- Message Feedback indexes
CREATE INDEX IF NOT EXISTS idx_message_feedback_user_id ON public.message_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_message_feedback_message_id ON public.message_feedback(message_id);

-- LLM Usage indexes
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created ON public.llm_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON public.llm_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_source ON public.llm_usage_events(source, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_runs_user_client_message
    ON public.llm_runs(user_id, client_message_id)
    WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_runs_user_session_status
    ON public.llm_runs(user_id, session_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_runs_session_created ON public.llm_runs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_run_events_run_seq ON public.llm_run_events(run_id, seq);

-- Referral / redemption indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_active ON public.redemption_codes(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_redemption_redemptions_user ON public.redemption_redemptions(user_id, redeemed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_afdian_bindings_afdian_user ON public.afdian_bindings(afdian_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_afdian_bindings_private_id
    ON public.afdian_bindings(user_private_id)
    WHERE user_private_id IS NOT NULL AND user_private_id <> '';
CREATE INDEX IF NOT EXISTS idx_afdian_binding_codes_user ON public.afdian_binding_codes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_afdian_orders_user ON public.afdian_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_afdian_orders_status ON public.afdian_orders(process_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_afdian_orders_afdian_user ON public.afdian_orders(afdian_user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bazi_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_binding_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_plan_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Profiles Table Policies
-- ============================================

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- Bazi Profiles Table Policies
-- ============================================

CREATE POLICY "Users can view own bazi profiles"
    ON public.bazi_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bazi profiles"
    ON public.bazi_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bazi profiles"
    ON public.bazi_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bazi profiles"
    ON public.bazi_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- Chat Sessions Table Policies
-- ============================================

CREATE POLICY "Users can view own chat sessions"
    ON public.chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions"
    ON public.chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions"
    ON public.chat_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions"
    ON public.chat_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- Chat Messages Table Policies
-- ============================================

CREATE POLICY "Users can view own chat messages"
    ON public.chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own chat messages"
    ON public.chat_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own chat messages"
    ON public.chat_messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own chat messages"
    ON public.chat_messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- ============================================
-- LLM Usage Events Table Policies
-- ============================================

CREATE POLICY "Users can view own llm usage events"
    ON public.llm_usage_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own llm runs"
    ON public.llm_runs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own llm run events"
    ON public.llm_run_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.llm_runs
            WHERE llm_runs.id = llm_run_events.run_id
            AND llm_runs.user_id = auth.uid()
        )
    );

-- ============================================
-- Referrals / Redemption Policies
-- ============================================

CREATE POLICY "Users can view own referral relationships"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "Users can view own redemption history"
    ON public.redemption_redemptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own afdian binding"
    ON public.afdian_bindings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own afdian binding codes"
    ON public.afdian_binding_codes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own afdian orders"
    ON public.afdian_orders FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================
-- User Preferences Table Policies
-- ============================================

CREATE POLICY "Users can view own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Message Feedback Table Policies
-- ============================================

CREATE POLICY "Users can view own feedback"
    ON public.message_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
    ON public.message_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
    ON public.message_feedback FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback"
    ON public.message_feedback FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS for automatic timestamp updates
-- ============================================

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at column
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bazi_profiles_updated_at
    BEFORE UPDATE ON public.bazi_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_redemption_codes_updated_at
    BEFORE UPDATE ON public.redemption_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_afdian_bindings_updated_at
    BEFORE UPDATE ON public.afdian_bindings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_afdian_plan_mappings_updated_at
    BEFORE UPDATE ON public.afdian_plan_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_afdian_orders_updated_at
    BEFORE UPDATE ON public.afdian_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_llm_runs_updated_at
    BEFORE UPDATE ON public.llm_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Benefit, Referral, and Redemption RPCs
-- ============================================

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
            PERFORM public.apply_user_benefits(referral_row.referred_user_id, referral_row.new_user_reward_membership_days, 0, 0);
            PERFORM public.apply_user_benefits(referral_row.referrer_user_id, referral_row.referrer_reward_membership_days, 0, 0);

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

-- ============================================
-- TRIGGER for message count in sessions
-- ============================================

CREATE OR REPLACE FUNCTION update_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.chat_sessions
        SET message_count = message_count + 1,
            last_message_at = NOW()
        WHERE id = NEW.session_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.chat_sessions
        SET message_count = GREATEST(message_count - 1, 0)
        WHERE id = OLD.session_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_message_count_trigger
    AFTER INSERT OR DELETE ON public.chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_message_count();

-- ============================================
-- VIEWS for common queries (Optional)
-- ============================================

-- View: Active sessions with profile information
CREATE OR REPLACE VIEW public.active_sessions_with_profiles AS
SELECT 
    cs.id AS session_id,
    cs.user_id,
    cs.title AS session_title,
    cs.message_count,
    cs.last_message_at,
    bp.id AS profile_id,
    bp.profile_name,
    bp.avatar_emoji
FROM public.chat_sessions cs
LEFT JOIN public.bazi_profiles bp ON cs.bazi_profile_id = bp.id
WHERE cs.status = 'active'
ORDER BY cs.last_message_at DESC;

-- View: User statistics
CREATE OR REPLACE VIEW public.user_statistics AS
SELECT 
    u.id AS user_id,
    p.email,
    p.display_name,
    COUNT(DISTINCT bp.id) AS bazi_profiles_count,
    COUNT(DISTINCT cs.id) AS chat_sessions_count,
    COUNT(DISTINCT cm.id) AS total_messages_count,
    p.created_at AS user_created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.bazi_profiles bp ON u.id = bp.user_id
LEFT JOIN public.chat_sessions cs ON u.id = cs.user_id
LEFT JOIN public.chat_messages cm ON cs.id = cm.session_id
GROUP BY u.id, p.email, p.display_name, p.created_at;

-- ============================================
-- Sample Data (for testing - comment out in production)
-- ============================================

-- Note: Uncomment the following to insert sample data for testing
/*
-- Sample profile data will be inserted automatically when users sign up
-- Sample bazi profile
INSERT INTO public.bazi_profiles (
    user_id, profile_name, birth_year, birth_month, birth_day, 
    birth_hour, birth_minute, is_solar_calendar, gender, description
) VALUES (
    auth.uid(),
    'My Profile',
    1990, 1, 1, 12, 0, true, 'male',
    'Personal Bazi profile'
);
*/

-- ============================================
-- Verification Query
-- ============================================

-- Run this to verify the schema is correctly set up
SELECT 
    'Database schema created successfully!' AS status,
    COUNT(DISTINCT table_name) AS tables_created
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN (
        'profiles', 'bazi_profiles', 'chat_sessions', 
        'chat_messages', 'user_preferences', 'message_feedback',
        'user_quotas', 'llm_usage_events'
    );

-- Check RLS status
SELECT 
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN (
        'profiles', 'bazi_profiles', 'chat_sessions', 
        'chat_messages', 'user_preferences', 'message_feedback',
        'user_quotas', 'llm_usage_events'
    )
ORDER BY tablename;

-- Check policies count
SELECT 
    tablename,
    COUNT(*) AS policies_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- 7. User Quotas Table (Apple Quota System)
-- ============================================
-- Purpose: Track daily ULTRA mode usage quotas per user
-- "Apples" represent the daily allowance for ULTRA (Gemini) mode
-- Free users: 5 apples/day, Paid users: 999 apples/day

CREATE TABLE IF NOT EXISTS public.user_quotas (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Subscription status
    is_paid BOOLEAN DEFAULT FALSE,
    daily_apple_limit INTEGER DEFAULT 5,
    membership_expires_at TIMESTAMPTZ,
    bonus_apple_limit INTEGER DEFAULT 0,
    bonus_expires_at TIMESTAMPTZ,

    -- Daily usage tracking
    apples_used_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_quotas
    ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS bonus_apple_limit INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_quotas_is_paid ON public.user_quotas(is_paid);
CREATE INDEX IF NOT EXISTS idx_user_quotas_membership_expires ON public.user_quotas(membership_expires_at);

-- Enable RLS
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

-- Users can only view their own quota
CREATE POLICY "Users can view own quota"
    ON public.user_quotas FOR SELECT
    USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER update_user_quotas_updated_at
    BEFORE UPDATE ON public.user_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-create quota row when a new profile is inserted
CREATE OR REPLACE FUNCTION create_user_quota()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_quotas (
        user_id, is_paid, daily_apple_limit,
        membership_expires_at, bonus_apple_limit, bonus_expires_at,
        apples_used_today
    )
    VALUES (NEW.id, FALSE, 5, NULL, 0, NULL, 0)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_create_quota
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_user_quota();

-- ============================================
-- User Quota Performance RPCs
-- ============================================

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
) AS $$
DECLARE
    quota_row RECORD;
    today_key DATE := CURRENT_DATE;
    safe_count INTEGER := GREATEST(0, COALESCE(p_count, 0));
    membership_active BOOLEAN;
    bonus_active BOOLEAN;
    effective_limit INTEGER;
BEGIN
    INSERT INTO public.user_quotas (
        user_id, is_paid, daily_apple_limit,
        membership_expires_at, bonus_apple_limit, bonus_expires_at,
        apples_used_today, last_reset_date
    )
    VALUES (p_user_id, FALSE, 5, NULL, 0, NULL, 0, today_key)
    ON CONFLICT DO NOTHING;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
) AS $$
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
    SET apples_used_today = quota_row.apples_used_today, updated_at = NOW()
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- End of Schema
-- ============================================

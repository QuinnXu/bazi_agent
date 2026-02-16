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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Bazi Profiles indexes
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_user_id ON public.bazi_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_created_at ON public.bazi_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bazi_profiles_is_favorite ON public.bazi_profiles(user_id, is_favorite) WHERE is_favorite = TRUE;

-- Chat Sessions indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_bazi_profile_id ON public.chat_sessions(bazi_profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON public.chat_sessions(user_id, status);

-- Chat Messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON public.chat_messages(session_id, role);

-- Message Feedback indexes
CREATE INDEX IF NOT EXISTS idx_message_feedback_user_id ON public.message_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_message_feedback_message_id ON public.message_feedback(message_id);

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
        'user_quotas'
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
        'user_quotas'
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

    -- Daily usage tracking
    apples_used_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_quotas_is_paid ON public.user_quotas(is_paid);

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
    INSERT INTO public.user_quotas (user_id, is_paid, daily_apple_limit, apples_used_today)
    VALUES (NEW.id, FALSE, 5, 0)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_create_quota
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_user_quota();

-- ============================================
-- End of Schema
-- ============================================

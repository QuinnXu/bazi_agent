-- ============================================
-- Migration: 20260510_llm_usage_events
-- Purpose: Create or repair public.llm_usage_events so that admin token
--          analytics work end to end.
--
-- Run this once in Supabase Dashboard → SQL Editor.
-- The script is idempotent: it works whether the table exists, exists with
-- the older 4-value source CHECK, or doesn't exist yet.
-- ============================================

-- 1) Table (no inline CHECK on source/mode/status/feature_kind so we can
--    rebuild them below regardless of prior state).
CREATE TABLE IF NOT EXISTS public.llm_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Request source and context
    source TEXT NOT NULL,
    mode TEXT NOT NULL,
    feature_kind TEXT,

    -- Model routing metadata
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'completed',

    -- Estimated token usage
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Rebuild flexible CHECK constraints (drop & re-add so older 4-value
--    source whitelist gets upgraded to include 'agent_analysis').
ALTER TABLE public.llm_usage_events
    DROP CONSTRAINT IF EXISTS llm_usage_events_source_check;
ALTER TABLE public.llm_usage_events
    ADD CONSTRAINT llm_usage_events_source_check
    CHECK (source IN (
        'classic_chat',
        'agent_planner',
        'agent_analysis',
        'feature_page',
        'agent_tool'
    ));

ALTER TABLE public.llm_usage_events
    DROP CONSTRAINT IF EXISTS llm_usage_events_mode_check;
ALTER TABLE public.llm_usage_events
    ADD CONSTRAINT llm_usage_events_mode_check
    CHECK (mode IN ('classic', 'agent', 'feature'));

ALTER TABLE public.llm_usage_events
    DROP CONSTRAINT IF EXISTS llm_usage_events_status_check;
ALTER TABLE public.llm_usage_events
    ADD CONSTRAINT llm_usage_events_status_check
    CHECK (status IN ('completed', 'empty', 'aborted', 'failed'));

-- feature_kind intentionally left without a whitelist; the application
-- enforces the small set of canonical kinds before insert and we want to
-- accept arbitrary tags (report types, follow-up labels, etc.) without
-- having to migrate every time a new feature is added.
ALTER TABLE public.llm_usage_events
    DROP CONSTRAINT IF EXISTS llm_usage_events_feature_kind_check;

-- 3) Indexes (admin analytics rely on these for date / source / model rollups).
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created ON public.llm_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created      ON public.llm_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_source       ON public.llm_usage_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_model        ON public.llm_usage_events(model, created_at DESC);

-- 4) Row Level Security: regular users only see their own rows; admin queries
--    use the service role and bypass RLS.
ALTER TABLE public.llm_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own llm usage" ON public.llm_usage_events;
CREATE POLICY "Users can view own llm usage"
    ON public.llm_usage_events FOR SELECT
    USING (auth.uid() = user_id);

-- 5) Hint PostgREST to refresh its schema cache immediately so the API stops
--    returning "Could not find the table" errors right away.
NOTIFY pgrst, 'reload schema';

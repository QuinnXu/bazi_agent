-- Guest trial usage counters.
-- Stores only an opaque hashed browser key and trial counts; no chat content.

CREATE TABLE IF NOT EXISTS public.guest_trial_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_key_hash TEXT NOT NULL UNIQUE,
    final_answers_used INTEGER NOT NULL DEFAULT 0 CHECK (final_answers_used >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_trial_usage_expires_at
    ON public.guest_trial_usage(expires_at);

ALTER TABLE public.guest_trial_usage ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_guest_trial_usage_updated_at ON public.guest_trial_usage;
CREATE TRIGGER update_guest_trial_usage_updated_at
    BEFORE UPDATE ON public.guest_trial_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

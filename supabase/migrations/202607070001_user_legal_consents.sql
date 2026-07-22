-- Legal agreement consent audit trail.
-- Stores the agreement version accepted during signup without retaining raw email.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_legal_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email_hash TEXT NOT NULL,
    agreement_version TEXT NOT NULL,
    accepted_agreements TEXT[] NOT NULL DEFAULT ARRAY['user-agreement', 'privacy', 'renewal']::TEXT[],
    consent_source TEXT NOT NULL DEFAULT 'signup'
        CHECK (consent_source IN ('signup', 'manual', 'admin_import')),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, agreement_version, consent_source),
    CHECK (array_length(accepted_agreements, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_legal_consents_user_id
    ON public.user_legal_consents(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_legal_consents_email_hash
    ON public.user_legal_consents(email_hash);
CREATE INDEX IF NOT EXISTS idx_user_legal_consents_accepted_at
    ON public.user_legal_consents(accepted_at DESC);

ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own legal consents" ON public.user_legal_consents;
CREATE POLICY "Users can view own legal consents"
    ON public.user_legal_consents FOR SELECT
    USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

-- Persist Liuyao as a first-class chat mode while keeping existing
-- Agent/classic sessions and routes unchanged.

ALTER TABLE public.chat_sessions
    ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'classic';

UPDATE public.chat_sessions
SET mode = 'classic'
WHERE mode IS NULL
   OR mode NOT IN ('classic', 'agent', 'liuyao');

ALTER TABLE public.chat_sessions
    DROP CONSTRAINT IF EXISTS chat_sessions_mode_check;
ALTER TABLE public.chat_sessions
    ADD CONSTRAINT chat_sessions_mode_check
    CHECK (mode IN ('classic', 'agent', 'liuyao'));

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'classic';

UPDATE public.chat_messages
SET mode = 'classic'
WHERE mode IS NULL
   OR mode NOT IN ('classic', 'agent', 'liuyao');

ALTER TABLE public.chat_messages
    DROP CONSTRAINT IF EXISTS chat_messages_mode_check;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_mode_check
    CHECK (mode IN ('classic', 'agent', 'liuyao'));

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode
    ON public.chat_sessions(user_id, mode);

CREATE INDEX IF NOT EXISTS idx_chat_messages_mode
    ON public.chat_messages(session_id, mode);

CREATE TABLE IF NOT EXISTS public.chat_session_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    context_type TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, context_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_session_contexts_session
    ON public.chat_session_contexts(session_id);

ALTER TABLE public.chat_session_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chat session contexts" ON public.chat_session_contexts;
CREATE POLICY "Users can view own chat session contexts"
    ON public.chat_session_contexts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_session_contexts.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own chat session contexts" ON public.chat_session_contexts;
CREATE POLICY "Users can insert own chat session contexts"
    ON public.chat_session_contexts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_session_contexts.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update own chat session contexts" ON public.chat_session_contexts;
CREATE POLICY "Users can update own chat session contexts"
    ON public.chat_session_contexts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_session_contexts.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_session_contexts.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own chat session contexts" ON public.chat_session_contexts;
CREATE POLICY "Users can delete own chat session contexts"
    ON public.chat_session_contexts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_session_contexts.session_id
              AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.set_chat_session_context_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_chat_session_contexts_updated_at
    ON public.chat_session_contexts;
CREATE TRIGGER update_chat_session_contexts_updated_at
    BEFORE UPDATE ON public.chat_session_contexts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_chat_session_context_updated_at();

NOTIFY pgrst, 'reload schema';

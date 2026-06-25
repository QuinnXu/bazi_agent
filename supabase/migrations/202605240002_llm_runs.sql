-- Durable LLM run state for recoverable background reasoning.
-- Use named dollar quotes so this file is safer to paste into Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.llm_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    client_message_id text,
    kind text NOT NULL CHECK (kind IN ('classic_chat', 'agent_chat', 'feature_analyze')),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_text text NOT NULL DEFAULT '',
    final_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    assistant_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
    model text,
    task text,
    input_tokens integer NOT NULL DEFAULT 0,
    apple_cost integer NOT NULL DEFAULT 0,
    quota_refunded boolean NOT NULL DEFAULT false,
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    canceled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_runs_user_client_message
    ON public.llm_runs(user_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_runs_user_session_status
    ON public.llm_runs(user_id, session_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_runs_session_created
    ON public.llm_runs(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.llm_run_events (
    id bigserial PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES public.llm_runs(id) ON DELETE CASCADE,
    seq integer NOT NULL,
    event_type text NOT NULL,
    content text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_llm_run_events_run_seq
    ON public.llm_run_events(run_id, seq);

ALTER TABLE public.llm_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own llm runs" ON public.llm_runs;
CREATE POLICY "Users can read own llm runs"
    ON public.llm_runs FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own llm run events" ON public.llm_run_events;
CREATE POLICY "Users can read own llm run events"
    ON public.llm_run_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.llm_runs
            WHERE llm_runs.id = llm_run_events.run_id
              AND llm_runs.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.touch_llm_runs_updated_at()
RETURNS trigger AS $touch_llm_runs_updated_at$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$touch_llm_runs_updated_at$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_llm_runs_updated_at ON public.llm_runs;
CREATE TRIGGER trg_touch_llm_runs_updated_at
    BEFORE UPDATE ON public.llm_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_llm_runs_updated_at();

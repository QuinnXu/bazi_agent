-- Speed up recent completed durable-run lookups for one user's current session.

CREATE INDEX IF NOT EXISTS idx_llm_runs_user_session_status_updated
    ON public.llm_runs(user_id, session_id, status, updated_at DESC);

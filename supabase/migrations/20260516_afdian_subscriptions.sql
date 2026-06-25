-- Afdian subscription integration.

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_afdian_bindings_afdian_user
    ON public.afdian_bindings(afdian_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_afdian_bindings_private_id
    ON public.afdian_bindings(user_private_id)
    WHERE user_private_id IS NOT NULL AND user_private_id <> '';

CREATE TABLE IF NOT EXISTS public.afdian_binding_codes (
    code TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_afdian_binding_codes_user
    ON public.afdian_binding_codes(user_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_afdian_orders_user
    ON public.afdian_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_afdian_orders_status
    ON public.afdian_orders(process_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_afdian_orders_afdian_user
    ON public.afdian_orders(afdian_user_id, created_at DESC);

ALTER TABLE public.afdian_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_binding_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_plan_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afdian_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own afdian binding" ON public.afdian_bindings;
CREATE POLICY "Users can view own afdian binding"
    ON public.afdian_bindings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own afdian binding codes" ON public.afdian_binding_codes;
CREATE POLICY "Users can view own afdian binding codes"
    ON public.afdian_binding_codes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own afdian orders" ON public.afdian_orders;
CREATE POLICY "Users can view own afdian orders"
    ON public.afdian_orders FOR SELECT
    USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_afdian_bindings_updated_at ON public.afdian_bindings;
CREATE TRIGGER update_afdian_bindings_updated_at
    BEFORE UPDATE ON public.afdian_bindings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_afdian_plan_mappings_updated_at ON public.afdian_plan_mappings;
CREATE TRIGGER update_afdian_plan_mappings_updated_at
    BEFORE UPDATE ON public.afdian_plan_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_afdian_orders_updated_at ON public.afdian_orders;
CREATE TRIGGER update_afdian_orders_updated_at
    BEFORE UPDATE ON public.afdian_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

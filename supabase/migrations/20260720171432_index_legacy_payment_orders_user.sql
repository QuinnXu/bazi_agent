CREATE INDEX IF NOT EXISTS idx_legacy_payment_orders_user
    ON public.legacy_payment_orders(user_id, archived_at DESC);

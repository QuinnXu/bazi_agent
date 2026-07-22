-- Allow a user to abandon an unpaid checkout without losing the financial audit trail.
-- OTT Checkout has no documented close-order API, so abandoned provider orders remain
-- eligible for reconciliation and entitlement fulfilment if they are paid later.

ALTER TABLE public.ottpay_orders
    ADD COLUMN user_cancelled_at TIMESTAMPTZ,
    ADD COLUMN user_cancel_reason TEXT;

DROP INDEX IF EXISTS public.idx_ottpay_orders_active_user;

CREATE UNIQUE INDEX idx_ottpay_orders_active_user
    ON public.ottpay_orders(user_id)
    WHERE user_id IS NOT NULL
      AND user_cancelled_at IS NULL
      AND status IN ('created', 'pending', 'processing');

CREATE INDEX idx_ottpay_orders_user_cancelled
    ON public.ottpay_orders(user_cancelled_at, created_at)
    WHERE user_cancelled_at IS NOT NULL
      AND status IN ('created', 'pending', 'processing');

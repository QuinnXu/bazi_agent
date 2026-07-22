-- Preserve financial order history while allowing the owning Auth user to be
-- deleted. RLS continues to hide anonymized rows because auth.uid() cannot
-- equal NULL.

ALTER TABLE public.ottpay_orders
    DROP CONSTRAINT IF EXISTS ottpay_orders_user_id_fkey;

ALTER TABLE public.ottpay_orders
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.ottpay_orders
    ADD CONSTRAINT ottpay_orders_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

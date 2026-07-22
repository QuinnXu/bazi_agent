-- Fix PL/pgSQL output-column ambiguity in grant_apple_wallet.
-- The RETURNS TABLE output named expires_at is also a PL/pgSQL variable, so every
-- apple_wallet_lots column used in aggregate subqueries must be table-qualified.

CREATE OR REPLACE FUNCTION public.grant_apple_wallet(
    p_user_id UUID,
    p_amount INTEGER,
    p_expiry_days INTEGER DEFAULT 90,
    p_sku TEXT DEFAULT 'apple-wallet',
    p_source TEXT DEFAULT 'admin',
    p_external_order_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    wallet_lot_id UUID,
    granted_amount INTEGER,
    expires_at TIMESTAMPTZ,
    wallet_balance INTEGER,
    wallet_expires_at TIMESTAMPTZ
) AS $grant_apple_wallet$
DECLARE
    existing_row public.apple_wallet_lots%ROWTYPE;
    new_id UUID;
    expiry TIMESTAMPTZ;
    safe_amount INTEGER := GREATEST(0, COALESCE(p_amount, 0));
    safe_days INTEGER := GREATEST(0, COALESCE(p_expiry_days, 0));
BEGIN
    IF safe_amount <= 0 OR safe_days <= 0 THEN
        RAISE EXCEPTION 'invalid apple wallet grant';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

    IF p_external_order_id IS NOT NULL AND p_external_order_id <> '' THEN
        SELECT lots.* INTO existing_row
        FROM public.apple_wallet_lots AS lots
        WHERE lots.source = p_source
          AND lots.external_order_id = p_external_order_id;
        IF FOUND THEN
            RETURN QUERY SELECT
                existing_row.id,
                existing_row.initial_amount,
                existing_row.expires_at,
                COALESCE((
                    SELECT SUM(active_lots.remaining_amount)::INTEGER
                    FROM public.apple_wallet_lots AS active_lots
                    WHERE active_lots.user_id = p_user_id
                      AND active_lots.remaining_amount > 0
                      AND active_lots.expires_at > NOW()
                ), 0),
                (
                    SELECT MIN(active_lots.expires_at)
                    FROM public.apple_wallet_lots AS active_lots
                    WHERE active_lots.user_id = p_user_id
                      AND active_lots.remaining_amount > 0
                      AND active_lots.expires_at > NOW()
                );
            RETURN;
        END IF;
    END IF;

    IF p_source = 'ottpay' AND EXISTS (
        SELECT 1
        FROM public.user_quotas AS quotas
        WHERE quotas.user_id = p_user_id
          AND quotas.ultra_expires_at IS NOT NULL
          AND quotas.ultra_expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'Ultra members cannot purchase apple packs while active';
    END IF;

    expiry := NOW() + make_interval(days => safe_days);
    INSERT INTO public.apple_wallet_lots (
        user_id, source, sku, initial_amount, remaining_amount,
        expires_at, external_order_id, metadata
    ) VALUES (
        p_user_id, p_source, p_sku, safe_amount, safe_amount,
        expiry, NULLIF(p_external_order_id, ''), COALESCE(p_metadata, '{}'::JSONB)
    ) RETURNING id INTO new_id;

    RETURN QUERY SELECT
        new_id,
        safe_amount,
        expiry,
        COALESCE((
            SELECT SUM(active_lots.remaining_amount)::INTEGER
            FROM public.apple_wallet_lots AS active_lots
            WHERE active_lots.user_id = p_user_id
              AND active_lots.remaining_amount > 0
              AND active_lots.expires_at > NOW()
        ), 0),
        (
            SELECT MIN(active_lots.expires_at)
            FROM public.apple_wallet_lots AS active_lots
            WHERE active_lots.user_id = p_user_id
              AND active_lots.remaining_amount > 0
              AND active_lots.expires_at > NOW()
        );
END;
$grant_apple_wallet$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Fail-closed OTT Pay lifecycle hardening and scheduled reconciliation.

ALTER TABLE public.ottpay_orders
    RENAME COLUMN expires_at TO provider_expires_at;

ALTER TABLE public.ottpay_orders
    ADD COLUMN expires_at TIMESTAMPTZ,
    ADD COLUMN provider_currency TEXT
        CHECK (provider_currency IS NULL OR provider_currency IN ('CAD', 'USD', 'CNY')),
    ADD COLUMN provider_payment_reference TEXT,
    ADD COLUMN callback_received_at TIMESTAMPTZ,
    ADD COLUMN last_synced_at TIMESTAMPTZ,
    ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempts >= 0);

UPDATE public.ottpay_orders
SET expires_at = created_at + INTERVAL '15 minutes'
WHERE expires_at IS NULL;

ALTER TABLE public.ottpay_orders
    ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX idx_ottpay_orders_active_user
    ON public.ottpay_orders(user_id)
    WHERE user_id IS NOT NULL
      AND status IN ('created', 'pending', 'processing');

CREATE INDEX idx_ottpay_orders_payment_reference
    ON public.ottpay_orders(provider_payment_reference)
    WHERE provider_payment_reference IS NOT NULL
      AND provider_payment_reference <> '';

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'ottpay-reconcile-every-five-minutes',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
        url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'ottpay_reconcile_url'
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'ottpay_reconcile_secret'
            )
        ),
        body := jsonb_build_object('scheduled_at', NOW()),
        timeout_milliseconds := 55000
    ) AS request_id;
    $cron$
);

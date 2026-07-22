-- Security hardening for the rebuilt askbubu Supabase schema.
-- Keeps public/anon users away from admin RPCs and removes broad public views.

DROP VIEW IF EXISTS public.user_statistics;
DROP VIEW IF EXISTS public.active_sessions_with_profiles;

ALTER FUNCTION public.generate_referral_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_user_benefits(UUID, INTEGER, INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_referral_reward(UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.redeem_redemption_code(UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_session_message_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_user_quota() SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_user_apples(UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.refund_user_apples(UUID, INTEGER) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_user_benefits(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_referral_reward(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_redemption_code(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_quota() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_user_apples(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_user_benefits(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_referral_reward(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_redemption_code(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_quota() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_apples(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_apples(UUID, INTEGER) TO service_role;

-- Reduce duplicate permissive drama policies and restrict owner-check RPC execution.
DROP POLICY IF EXISTS nexora_read_published_dramas ON public.dramas;
DROP POLICY IF EXISTS nexora_owner_insert_dramas ON public.dramas;
DROP POLICY IF EXISTS nexora_owner_delete_dramas ON public.dramas;

REVOKE EXECUTE ON FUNCTION public.is_nexora_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_nexora_owner() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS dramas_created_by_idx ON public.dramas (created_by);
CREATE INDEX IF NOT EXISTS nexora_episode_entitlements_drama_id_idx ON public.nexora_episode_entitlements (drama_id);
CREATE INDEX IF NOT EXISTS nexora_rewarded_ad_transactions_attempt_id_idx ON public.nexora_rewarded_ad_transactions (attempt_id);
CREATE INDEX IF NOT EXISTS nexora_rewarded_ad_transactions_drama_id_idx ON public.nexora_rewarded_ad_transactions (drama_id);
CREATE INDEX IF NOT EXISTS nexora_rewarded_ad_transactions_user_id_idx ON public.nexora_rewarded_ad_transactions (user_id);
CREATE INDEX IF NOT EXISTS nexora_rewarded_unlock_attempts_drama_id_idx ON public.nexora_rewarded_unlock_attempts (drama_id);
CREATE INDEX IF NOT EXISTS nexora_subscription_events_user_id_idx ON public.nexora_subscription_events (user_id);
CREATE INDEX IF NOT EXISTS nexora_subscriptions_plan_id_idx ON public.nexora_subscriptions (plan_id);

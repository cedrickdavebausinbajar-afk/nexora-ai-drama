-- Track one stable checkout attempt per user/provider environment.
-- A unique constraint prevents two browser requests from reserving the same attempt.
alter table public.nexora_subscriptions
  add column if not exists checkout_attempt_id uuid;

create unique index if not exists nexora_subscription_checkout_attempt_unique
  on public.nexora_subscriptions (user_id, provider, provider_mode, checkout_attempt_id)
  where checkout_attempt_id is not null;

create index if not exists nexora_subscriptions_provider_subscription_lookup
  on public.nexora_subscriptions (provider, provider_mode, provider_subscription_id)
  where provider_subscription_id is not null;

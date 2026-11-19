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

-- A read-before-insert check in an Edge Function cannot by itself prevent two
-- different checkout attempts racing for the same user. Enforce one unresolved
-- subscription per user/provider environment at the database boundary.
do $$
begin
  if exists (
    select 1
    from public.nexora_subscriptions
    where status in ('pending', 'active', 'past_due')
    group by user_id, provider, provider_mode
    having count(*) > 1
  ) then
    raise exception
      'Cannot add NEXORA active-subscription guard: duplicate pending/active/past_due rows exist. Reconcile them before retrying this migration.';
  end if;
end
$$;

create unique index if not exists nexora_one_open_subscription_per_user_provider
  on public.nexora_subscriptions (user_id, provider, provider_mode)
  where status in ('pending', 'active', 'past_due');

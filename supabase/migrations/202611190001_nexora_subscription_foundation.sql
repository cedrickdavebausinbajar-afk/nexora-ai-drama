-- NEXORA AI DRAMA: subscription foundation (schema only; no payment activation).
-- Apply through the Supabase SQL editor after reviewing the target project.
-- Prices are stored in PHP whole-peso units: ₱99 monthly and ₱66 weekly.

create extension if not exists pgcrypto;

create table if not exists public.nexora_subscription_plans (
  id text primary key,
  name text not null,
  amount_php integer not null check (amount_php > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  interval_unit text not null check (interval_unit in ('week', 'month')),
  interval_count integer not null default 1 check (interval_count = 1),
  ad_free boolean not null default true,
  exclusive_dramas boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nexora_subscription_plans
  (id, name, amount_php, currency, interval_unit, interval_count, ad_free, exclusive_dramas, active)
values
  ('nexora_weekly_66', 'NEXORA Premium Weekly', 66, 'PHP', 'week', 1, true, true, true),
  ('nexora_monthly_99', 'NEXORA Premium Monthly', 99, 'PHP', 'month', 1, true, true, true)
on conflict (id) do nothing;

alter table public.nexora_subscription_plans enable row level security;
drop policy if exists "Active subscription plans are public" on public.nexora_subscription_plans;
create policy "Active subscription plans are public"
  on public.nexora_subscription_plans
  for select
  to anon, authenticated
  using (active = true);
grant select on public.nexora_subscription_plans to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.nexora_subscription_plans from anon, authenticated;

create table if not exists public.nexora_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.nexora_subscription_plans(id),
  provider text not null check (char_length(provider) between 2 and 40),
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nexora_subscription_period_valid
    check (current_period_end is null or current_period_start is null or current_period_end > current_period_start),
  constraint nexora_provider_subscription_unique
    unique (provider, provider_subscription_id)
);

create index if not exists nexora_subscriptions_user_status_idx
  on public.nexora_subscriptions (user_id, status, current_period_end desc);

alter table public.nexora_subscriptions enable row level security;
drop policy if exists "Users can read their own subscriptions" on public.nexora_subscriptions;
create policy "Users can read their own subscriptions"
  on public.nexora_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));
grant select on public.nexora_subscriptions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.nexora_subscriptions from anon, authenticated;

-- Minimal event ledger for idempotent webhook processing. Do not store raw webhook
-- bodies, card data, access tokens, or provider secrets in this table.
create table if not exists public.nexora_subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 40),
  provider_event_id text not null,
  event_type text not null,
  provider_payment_id text,
  provider_subscription_id text,
  subscription_id uuid references public.nexora_subscriptions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  amount_php integer check (amount_php is null or amount_php >= 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  event_status text not null default 'received'
    check (event_status in ('received', 'processed', 'ignored', 'failed')),
  payload_sha256 text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  constraint nexora_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists nexora_subscription_events_subscription_idx
  on public.nexora_subscription_events (subscription_id, received_at desc);

alter table public.nexora_subscription_events enable row level security;
-- Intentionally no client-facing policies or grants: webhook processing must use
-- a trusted server-side Supabase Edge Function with service-role credentials.
revoke all on public.nexora_subscription_events from anon, authenticated;
revoke all on public.nexora_subscription_events from public;

-- Client apps may read their own subscription status and active plan definitions.
-- Only trusted server-side code may create/update subscriptions or process events.

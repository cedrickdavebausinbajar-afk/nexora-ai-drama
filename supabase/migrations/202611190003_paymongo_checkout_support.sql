-- NEXORA AI DRAMA: PayMongo checkout support (server-side only).
-- Provider plan IDs are configured as Edge Function secrets per environment.
-- Never expose PayMongo secret keys in the APK or browser bundle.

alter table public.nexora_subscriptions
  add column if not exists provider_mode text not null default 'test'
  check (provider_mode in ('test', 'live'));

create table if not exists public.nexora_provider_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'paymongo'),
  provider_mode text not null check (provider_mode in ('test', 'live')),
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_mode),
  unique (provider, provider_mode, provider_customer_id)
);

alter table public.nexora_provider_customers enable row level security;
revoke all on public.nexora_provider_customers from public, anon, authenticated;
-- No client policies: customer mappings are service-role only.

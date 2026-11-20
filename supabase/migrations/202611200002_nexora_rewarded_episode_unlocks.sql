-- NEXORA AI DRAMA: server-verified one-episode rewarded unlocks.
-- Clients cannot write the reward ledger. Only service-role Edge Functions may grant access.
create table if not exists public.nexora_rewarded_unlock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drama_id uuid not null references public.dramas(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','rewarded','expired','rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  rewarded_at timestamptz,
  constraint nexora_reward_attempt_expiry_valid check (expires_at > created_at)
);
create index if not exists nexora_reward_attempt_user_drama_idx on public.nexora_rewarded_unlock_attempts(user_id,drama_id,created_at desc);
create index if not exists nexora_reward_attempt_pending_idx on public.nexora_rewarded_unlock_attempts(expires_at) where status='pending';
create table if not exists public.nexora_rewarded_ad_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  attempt_id uuid not null references public.nexora_rewarded_unlock_attempts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  drama_id uuid not null references public.dramas(id) on delete cascade,
  ad_unit text not null, reward_item text not null, reward_amount integer not null check(reward_amount>0),
  callback_timestamp bigint not null, received_at timestamptz not null default now()
);
create table if not exists public.nexora_episode_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drama_id uuid not null references public.dramas(id) on delete cascade,
  source text not null check(source='admob_rewarded'),
  transaction_id text not null unique references public.nexora_rewarded_ad_transactions(transaction_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint nexora_episode_entitlement_once unique(user_id,drama_id)
);
alter table public.nexora_rewarded_unlock_attempts enable row level security;
alter table public.nexora_rewarded_ad_transactions enable row level security;
alter table public.nexora_episode_entitlements enable row level security;
revoke all on public.nexora_rewarded_unlock_attempts from public,anon,authenticated;
revoke all on public.nexora_rewarded_ad_transactions from public,anon,authenticated;
revoke all on public.nexora_episode_entitlements from public,anon,authenticated;
comment on table public.nexora_episode_entitlements is 'One-time episode access granted only after verified Google AdMob SSV callback.';

-- NEXORA AI DRAMA: secure owner-only publishing and public read access.
-- Run this migration in the Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.nexora_owner_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nexora_owner_users enable row level security;
-- No client policies are granted for the owner allowlist.
create or replace function public.is_nexora_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.nexora_owner_users owners where owners.user_id = (select auth.uid()));
$$;
revoke all on function public.is_nexora_owner() from public;
grant execute on function public.is_nexora_owner() to authenticated;
create table if not exists public.dramas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  episode text not null default 'Episode 1' check (char_length(episode) <= 80),
  category text not null default 'Other' check (char_length(category) <= 40),
  video_url text not null check (video_url ~* '^https://'),
  poster_url text check (poster_url is null or poster_url ~* '^https://'),
  creator text not null check (char_length(creator) between 1 and 120),
  source_url text not null check (source_url ~* '^https://'),
  permission_confirmed boolean not null default false check (permission_confirmed = true),
  published boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.dramas enable row level security;
drop policy if exists "Published dramas are readable by everyone" on public.dramas;
create policy "Published dramas are readable by everyone" on public.dramas for select to anon, authenticated using (published = true);
drop policy if exists "Owners can read all dramas" on public.dramas;
create policy "Owners can read all dramas" on public.dramas for select to authenticated using (public.is_nexora_owner());
drop policy if exists "Owners can publish dramas" on public.dramas;
create policy "Owners can publish dramas" on public.dramas for insert to authenticated with check (public.is_nexora_owner() and created_by = (select auth.uid()) and permission_confirmed = true);
drop policy if exists "Owners can remove dramas" on public.dramas;
create policy "Owners can remove dramas" on public.dramas for delete to authenticated using (public.is_nexora_owner());
grant select on public.dramas to anon, authenticated;
grant insert, delete on public.dramas to authenticated;
-- After creating the owner account in Supabase Auth, replace the UUID and run:
-- insert into public.nexora_owner_users (user_id) values ('YOUR-AUTH-USER-UUID');

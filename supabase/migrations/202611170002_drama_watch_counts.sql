-- NEXORA AI DRAMA: global watch counts for published videos.
-- Run after the existing secure owner library migration.
alter table public.dramas
  add column if not exists watch_count bigint not null default 0
  check (watch_count >= 0);

create or replace function public.record_drama_view(drama_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count bigint;
begin
  update public.dramas
  set watch_count = watch_count + 1
  where id = drama_id and published = true
  returning watch_count into updated_count;

  if updated_count is null then
    raise exception 'Published drama not found';
  end if;

  return updated_count;
end;
$$;

revoke all on function public.record_drama_view(uuid) from public;
grant execute on function public.record_drama_view(uuid) to anon, authenticated;

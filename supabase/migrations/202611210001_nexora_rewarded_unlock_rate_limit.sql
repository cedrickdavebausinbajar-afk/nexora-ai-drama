-- NEXORA AI DRAMA: serialize and rate-limit rewarded unlock attempts.
-- The function is callable only by the service-role Edge Function.
create or replace function public.create_nexora_rewarded_unlock_attempt(
  p_user_id uuid,
  p_drama_id uuid
)
returns table(attempt_id uuid, expires_at timestamptz, error_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.nexora_rewarded_unlock_attempts%rowtype;
  v_created public.nexora_rewarded_unlock_attempts%rowtype;
  v_recent_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_drama_id is null then
    raise exception 'invalid_unlock_arguments' using errcode = '22023';
  end if;

  -- Serialize requests per account so rapid concurrent taps cannot bypass the cap.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.nexora_rewarded_unlock_attempts
     set status = 'expired'
   where user_id = p_user_id
     and status = 'pending'
     and expires_at <= now();

  -- Retain recent forensic records; remove only old attempts with no transaction.
  delete from public.nexora_rewarded_unlock_attempts a
   where a.user_id = p_user_id
     and a.created_at < now() - interval '30 days'
     and not exists (
       select 1
         from public.nexora_rewarded_ad_transactions t
        where t.attempt_id = a.id
     );

  -- A duplicate request for the same active attempt returns the same nonce.
  select *
    into v_existing
    from public.nexora_rewarded_unlock_attempts
   where user_id = p_user_id
     and drama_id = p_drama_id
     and status = 'pending'
     and expires_at > now()
   order by created_at desc
   limit 1;

  if found then
    return query select v_existing.id, v_existing.expires_at, null::text;
    return;
  end if;

  select count(*)::integer
    into v_recent_count
    from public.nexora_rewarded_unlock_attempts
   where user_id = p_user_id
     and created_at > now() - interval '15 minutes';

  if v_recent_count >= 3 then
    return query select null::uuid, null::timestamptz, 'rate_limited'::text;
    return;
  end if;

  insert into public.nexora_rewarded_unlock_attempts(user_id, drama_id)
  values (p_user_id, p_drama_id)
  returning * into v_created;

  return query select v_created.id, v_created.expires_at, null::text;
end;
$$;

revoke all on function public.create_nexora_rewarded_unlock_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_nexora_rewarded_unlock_attempt(uuid, uuid) to service_role;

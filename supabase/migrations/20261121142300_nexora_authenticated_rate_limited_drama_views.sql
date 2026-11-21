-- Prevent anonymous view-count inflation and rate-limit repeated signed-in views.
-- The SECURITY DEFINER function uses an empty search_path and a private
-- per-user/per-drama rate-limit table; callers cannot read or write that table.
CREATE TABLE IF NOT EXISTS public.nexora_drama_view_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drama_id uuid NOT NULL REFERENCES public.dramas(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, drama_id)
);

ALTER TABLE public.nexora_drama_view_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nexora_drama_view_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_drama_view(drama_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_count bigint;
  accepted_user uuid;
  accepted_at timestamptz;
BEGIN
  accepted_user := auth.uid();
  IF accepted_user IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to record a drama view'
      USING ERRCODE = '42501';
  END IF;

  SELECT d.watch_count
    INTO current_count
    FROM public.dramas AS d
    WHERE d.id = $1 AND d.published = TRUE
    FOR UPDATE;

  IF current_count IS NULL THEN
    RAISE EXCEPTION 'Published drama not found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.nexora_drama_view_rate_limits AS limits
    (user_id, drama_id, last_viewed_at)
  VALUES (accepted_user, $1, now())
  ON CONFLICT (user_id, drama_id)
  DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at
    WHERE limits.last_viewed_at < now() - interval '30 minutes'
  RETURNING last_viewed_at INTO accepted_at;

  IF accepted_at IS NULL THEN
    RETURN current_count;
  END IF;

  UPDATE public.dramas
    SET watch_count = watch_count + 1
    WHERE id = $1
    RETURNING watch_count INTO current_count;

  RETURN current_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_drama_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_drama_view(uuid) TO authenticated, service_role;

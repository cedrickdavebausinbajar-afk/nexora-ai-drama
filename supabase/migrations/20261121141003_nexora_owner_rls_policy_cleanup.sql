CREATE POLICY "Users can verify their own owner status"
  ON public.nexora_owner_users
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

ALTER FUNCTION public.is_nexora_owner() SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.is_nexora_owner() TO authenticated;

DROP POLICY IF EXISTS "Owners can read all dramas" ON public.dramas;
DROP POLICY IF EXISTS "Published dramas are readable by everyone" ON public.dramas;

CREATE POLICY "Published dramas are readable by guests"
  ON public.dramas
  FOR SELECT
  TO anon
  USING (published = true);

CREATE POLICY "Published dramas and owner library are readable"
  ON public.dramas
  FOR SELECT
  TO authenticated
  USING (published = true OR public.is_nexora_owner());

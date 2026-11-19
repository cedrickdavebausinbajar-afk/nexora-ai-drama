-- NEXORA AI DRAMA: private storage foundation for premium video assets.
-- Keep the existing public bucket unchanged so free/public drama playback is not broken.
-- Trusted server-side entitlement code may create short-lived signed URLs using the
-- Supabase service-role key. Never expose that key in the APK or browser bundle.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nexora-premium-videos',
  'nexora-premium-videos',
  false,
  524288000,
  array['video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "NEXORA owners can upload premium videos" on storage.objects;
create policy "NEXORA owners can upload premium videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nexora-premium-videos'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can update premium videos" on storage.objects;
create policy "NEXORA owners can update premium videos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nexora-premium-videos'
  and public.is_nexora_owner()
)
with check (
  bucket_id = 'nexora-premium-videos'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can delete premium videos" on storage.objects;
create policy "NEXORA owners can delete premium videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nexora-premium-videos'
  and public.is_nexora_owner()
);

-- Intentionally do not create a SELECT policy for anon/authenticated users.
-- Premium playback must be authorized server-side and delivered via short-lived
-- signed URLs only after checking the user's active subscription.

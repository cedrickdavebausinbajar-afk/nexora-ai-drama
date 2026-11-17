-- NEXORA AI DRAMA: owner-only video uploads with public playback.
-- Apply after 202611160001_secure_owner_library.sql.
-- Uses the existing owner allowlist and RLS helper; no service-role key in clients.

alter table public.dramas
  add column if not exists video_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nexora-drama-videos',
  'nexora-drama-videos',
  true,
  524288000,
  array['video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read NEXORA drama videos" on storage.objects;
create policy "Public can read NEXORA drama videos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'nexora-drama-videos');

drop policy if exists "NEXORA owners can upload drama videos" on storage.objects;
create policy "NEXORA owners can upload drama videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nexora-drama-videos'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can update drama videos" on storage.objects;
create policy "NEXORA owners can update drama videos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nexora-drama-videos'
  and public.is_nexora_owner()
)
with check (
  bucket_id = 'nexora-drama-videos'
  and public.is_nexora_owner()
);

drop policy if exists "NEXORA owners can delete drama videos" on storage.objects;
create policy "NEXORA owners can delete drama videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nexora-drama-videos'
  and public.is_nexora_owner()
);

comment on column public.dramas.video_storage_path is
  'Object path in the nexora-drama-videos Supabase Storage bucket; video_url remains the public playback URL.';

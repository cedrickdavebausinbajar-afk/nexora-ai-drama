-- NEXORA AI DRAMA: optional synchronized subtitle tracks.
-- Run in Supabase SQL Editor after 202611170002_drama_watch_counts.sql.
alter table public.dramas
  add column if not exists subtitle_url text,
  add column if not exists subtitle_storage_path text,
  add column if not exists poster_storage_path text;

comment on column public.dramas.subtitle_url is 'Public WebVTT subtitle track URL; null means subtitles are disabled.';

-- NEXORA AI DRAMA: group uploaded videos into a series and order episodes.
-- Run after 202611170003_drama_subtitles.sql.
ALTER TABLE public.dramas
  ADD COLUMN IF NOT EXISTS parent_drama_id uuid REFERENCES public.dramas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS episode_number integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dramas_episode_number_positive'
      AND conrelid = 'public.dramas'::regclass
  ) THEN
    ALTER TABLE public.dramas
      ADD CONSTRAINT dramas_episode_number_positive CHECK (episode_number > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dramas_parent_episode_idx
  ON public.dramas (parent_drama_id, episode_number);

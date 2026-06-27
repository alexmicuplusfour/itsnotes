ALTER TABLE public.note_sketches
  ADD COLUMN IF NOT EXISTS thumbnail_dark TEXT;

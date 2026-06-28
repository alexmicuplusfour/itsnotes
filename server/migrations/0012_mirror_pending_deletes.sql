-- Restore ON DELETE CASCADE on note_files (removed in 0011 to fix orphaned .md files,
-- but that broke note deletion with a FK violation).
--
-- The real fix is a BEFORE DELETE trigger that captures the rel_path from note_files
-- before CASCADE wipes it, storing it in pending_mirror_deletes. The mirror worker
-- drains that table on the next sweep/reconcile and deletes the .md files from disk.
-- Zero changes to core note models or routes.

ALTER TABLE public.note_files DROP CONSTRAINT IF EXISTS note_files_note_id_fkey;
ALTER TABLE public.note_files ADD CONSTRAINT note_files_note_id_fkey
  FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.pending_mirror_deletes (
  id        BIGSERIAL PRIMARY KEY,
  rel_path  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.mirror_capture_delete() RETURNS trigger AS $$
DECLARE rpath TEXT;
BEGIN
  SELECT rel_path INTO rpath FROM public.note_files WHERE note_id = OLD.id;
  IF rpath IS NOT NULL THEN
    INSERT INTO public.pending_mirror_deletes (rel_path) VALUES (rpath);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mirror_capture_delete ON public.notes;
CREATE TRIGGER mirror_capture_delete
  BEFORE DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.mirror_capture_delete();

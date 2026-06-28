-- Drop the ON DELETE CASCADE from note_files → notes.
--
-- With CASCADE, permanently deleting a note wiped its note_files tracking row
-- in the same transaction as the DELETE on notes. By the time the mirror worker
-- processed the NOTIFY (fired AFTER the delete + cascades), the tracking row was
-- already gone — so planReconcile saw neither a desired entry nor a tracked one
-- and left the .md file in trash/ forever. The import scanner then found those
-- untracked files and (correctly) flagged them as new notes to import.
--
-- Without CASCADE the tracking row outlives the note. The next sweep sees an
-- orphaned row (tracked but not in desired) and emits a delete action, removing
-- the file from disk and cleaning up the row.

ALTER TABLE public.note_files DROP CONSTRAINT IF EXISTS note_files_note_id_fkey;
ALTER TABLE public.note_files ADD CONSTRAINT note_files_note_id_fkey
  FOREIGN KEY (note_id) REFERENCES public.notes(id);

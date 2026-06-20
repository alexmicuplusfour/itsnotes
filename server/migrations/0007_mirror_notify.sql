-- Live Markdown mirror: emit a NOTIFY whenever a note (or a row that feeds a
-- note's mirrored file) changes, so the mirror worker can update just that one
-- file within seconds instead of waiting for the periodic sweep.
--
-- The payload is always the affected note's UUID on channel 'mirror_note'. The
-- periodic reconcile sweep remains the source of correctness; NOTIFY is only a
-- fire-and-forget latency optimization (a dropped event self-heals on the next
-- sweep). See docs/md-mirroring-roadmap.md → "pg_notify is only a fast-path".
--
-- Tag/object *renames* are deliberately NOT triggered here: a single rename
-- fans out to many notes, so the sweep handles those rather than this per-note
-- fast path. Assigning/removing a tag on a note flows through note_tags below,
-- so that common case is still live.

-- notes: the note id is the key column.
CREATE OR REPLACE FUNCTION public.mirror_notify_note() RETURNS trigger AS $$
DECLARE
  nid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN nid := OLD.id; ELSE nid := NEW.id; END IF;
  IF nid IS NOT NULL THEN PERFORM pg_notify('mirror_note', nid::text); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- child tables (note_tags, note_images, note_attachments, reminders): keyed by note_id.
CREATE OR REPLACE FUNCTION public.mirror_notify_child() RETURNS trigger AS $$
DECLARE
  nid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN nid := OLD.note_id; ELSE nid := NEW.note_id; END IF;
  IF nid IS NOT NULL THEN PERFORM pg_notify('mirror_note', nid::text); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mirror_notify ON public.notes;
CREATE TRIGGER mirror_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notify_note();

DROP TRIGGER IF EXISTS mirror_notify ON public.note_tags;
CREATE TRIGGER mirror_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.note_tags
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notify_child();

DROP TRIGGER IF EXISTS mirror_notify ON public.note_images;
CREATE TRIGGER mirror_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.note_images
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notify_child();

DROP TRIGGER IF EXISTS mirror_notify ON public.note_attachments;
CREATE TRIGGER mirror_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.note_attachments
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notify_child();

DROP TRIGGER IF EXISTS mirror_notify ON public.reminders;
CREATE TRIGGER mirror_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notify_child();

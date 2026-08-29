-- Sorting by updated_at is now a first-class list sort ("Recently Updated" on
-- the main view; search has always used it). created_at has had an index since
-- the baseline; give updated_at the same treatment.
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at);

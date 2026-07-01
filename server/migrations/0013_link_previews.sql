ALTER TABLE note_links ADD COLUMN IF NOT EXISTS favicon_url TEXT;
ALTER TABLE note_links ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS note_links_note_id_idx ON note_links(note_id);

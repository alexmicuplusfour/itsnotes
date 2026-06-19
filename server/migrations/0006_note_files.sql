-- Tracks the DB-note → .md-file mapping for the Markdown mirror (Phase 2).
-- One row per mirrored note. Makes drift detection cheap: compare the note's
-- freshly rendered content_hash against the stored one to decide a rewrite.
-- See docs/md-mirroring-roadmap.md → "Phase 2 — One-way export".

CREATE TABLE IF NOT EXISTS public.note_files (
    note_id UUID PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
    rel_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL
);

-- rel_path must be unique: two notes can never map to the same file.
CREATE UNIQUE INDEX IF NOT EXISTS note_files_rel_path_key ON public.note_files (rel_path);

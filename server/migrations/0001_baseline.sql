-- Baseline schema as of 2026-06
-- Idempotent: safe to run against an existing production database or a fresh one.
-- Source of truth: pg_dump-202605250041.sql + all migrations applied through that date.

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_duplicate_notes() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notes
    WHERE title = NEW.title
      AND content = NEW.content
      AND id != NEW.id
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notes_notify_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    action_type TEXT;
    payload JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN action_type := 'INSERT';
    ELSIF TG_OP = 'UPDATE' THEN action_type := 'UPDATE';
    ELSIF TG_OP = 'DELETE' THEN action_type := 'DELETE';
    END IF;

    IF TG_OP = 'DELETE' THEN
        payload := jsonb_build_object(
            'table', 'notes', 'action', action_type,
            'notification', jsonb_build_object('id', OLD.id, 'updated_at', CURRENT_TIMESTAMP)
        );
    ELSE
        payload := jsonb_build_object(
            'table', 'notes', 'action', action_type,
            'notification', jsonb_build_object('id', NEW.id, 'updated_at', NEW.updated_at)
        );
    END IF;

    PERFORM pg_notify('notes_changes', payload::text);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_note_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('notes_changes', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_note_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    payload TEXT;
BEGIN
    payload := json_build_object(
        'noteId', NEW.id,
        'action', TG_OP,
        'updated_at', NEW.updated_at,
        'fetch_required', true
    )::text;
    PERFORM pg_notify('notes_changes', payload);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_note_tag_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  payload TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload := json_build_object('note_id', OLD.note_id, 'tag_id', OLD.tag_id, 'action', TG_OP)::text;
  ELSE
    payload := json_build_object('note_id', NEW.note_id, 'tag_id', NEW.tag_id, 'action', TG_OP)::text;
  END IF;
  PERFORM pg_notify('note_tags_changes', payload);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_notes_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  record_data json;
  notification json;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    record_data = json_build_object('id', OLD.id, 'title', OLD.title, 'deleted_at', now());
  ELSE
    record_data = row_to_json(NEW);
  END IF;
  notification = json_build_object('table', TG_TABLE_NAME, 'action', TG_OP, 'data', record_data);
  PERFORM pg_notify('notes_changes', notification::text);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_tag_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  payload TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload := json_build_object('id', OLD.id, 'action', TG_OP)::text;
  ELSE
    payload := row_to_json(NEW)::text;
  END IF;
  PERFORM pg_notify('tags_changes', payload);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_note_metadata() RETURNS trigger
    LANGUAGE plpgsql AS $_$
DECLARE
    tag_names TEXT[];
    month_text TEXT;
    color_text TEXT;
BEGIN
    SELECT ARRAY_AGG('#' || t.name ORDER BY t.name)
    INTO tag_names
    FROM note_tags nt
    JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = NEW.id;

    month_text := 'yr:' || EXTRACT(YEAR FROM NEW.created_at) || ':' ||
                 LOWER(TO_CHAR(NEW.created_at, 'mon'));

    color_text := '$' || NEW.color;

    NEW.metadata := jsonb_build_object(
        'color', color_text,
        'tags', COALESCE(tag_names, '{}'::text[]),
        'date', month_text
    );

    RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION public.update_note_metadata_on_note_tag_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    note_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN note_id := NEW.note_id;
    ELSIF TG_OP = 'DELETE' THEN note_id := OLD.note_id;
    END IF;
    UPDATE notes SET updated_at = now() WHERE id = note_id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_note_metadata_on_tag_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    note_ids UUID[];
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        SELECT array_agg(note_id) INTO note_ids
        FROM note_tags WHERE tag_id = OLD.id;
        UPDATE notes SET updated_at = now() WHERE id = ANY(note_ids);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    content TEXT,
    color VARCHAR(20) DEFAULT 'default',
    is_pinned BOOLEAN DEFAULT FALSE NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,
    pinned_at TIMESTAMPTZ,
    unpinned_at TIMESTAMPTZ,
    trashed_at TIMESTAMPTZ,
    untrashed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    unarchived_at TIMESTAMPTZ,
    plain_content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS public.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    thumbnail_url TEXT,
    source_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    external_id VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    visible BOOLEAN DEFAULT TRUE NOT NULL,
    is_folder BOOLEAN DEFAULT FALSE,
    parent_id UUID REFERENCES public.tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.note_images (
    id SERIAL PRIMARY KEY,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    thumbnail TEXT NOT NULL,
    name TEXT,
    type TEXT,
    size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.note_attachments (
    id SERIAL PRIMARY KEY,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.note_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.note_objects (
    id SERIAL PRIMARY KEY,
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(note_id, object_id)
);

CREATE TABLE IF NOT EXISTS public.note_tags (
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.note_versions (
    id SERIAL PRIMARY KEY,
    note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    raw_content TEXT
);

CREATE TABLE IF NOT EXISTS public.reminders (
    id SERIAL PRIMARY KEY,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE,
    rrule TEXT,
    next_run_at TIMESTAMPTZ NOT NULL,
    timezone TEXT DEFAULT 'UTC' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- COLUMNS ADDED BY MIGRATIONS (idempotent for older schemas)
-- ============================================================

ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.tags(id) ON DELETE CASCADE;
ALTER TABLE public.note_versions ADD COLUMN IF NOT EXISTS raw_content TEXT;
ALTER TABLE public.objects ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);

-- ============================================================
-- FOREIGN KEYS ADDED AFTER INITIAL SCHEMA (idempotent for existing DBs)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_user_id_fkey') THEN
    ALTER TABLE public.objects ADD CONSTRAINT objects_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_tags_tag_id_fkey') THEN
    ALTER TABLE public.note_tags ADD CONSTRAINT note_tags_tag_id_fkey
      FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
  END IF;
END; $$;

-- ============================================================
-- UNIQUE CONSTRAINT MIGRATION: replace tags_name_key with
-- a parent-scoped unique index (scope_tag_name_unique_to_parent)
-- ============================================================

ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_parent_unique
    ON public.tags (LOWER(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON public.note_attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_images_note_id ON public.note_images(note_id);
CREATE INDEX IF NOT EXISTS idx_note_objects_note_id ON public.note_objects(note_id);
CREATE INDEX IF NOT EXISTS idx_note_objects_object_id ON public.note_objects(object_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON public.note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id_tag_id ON public.note_tags(note_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON public.note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_created_at ON public.note_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON public.note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notes_is_archived ON public.notes(is_archived);
CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON public.notes(is_deleted);
CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON public.notes(is_pinned);
CREATE INDEX IF NOT EXISTS idx_notes_metadata ON public.notes USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_objects_title_search ON public.objects USING gin(to_tsvector('english', title));
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_user_source_url ON public.objects(user_id, source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objects_user_external_id ON public.objects(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_user_external_id_unique ON public.objects(user_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objects_user_type ON public.objects(user_id, type);
CREATE INDEX IF NOT EXISTS idx_reminders_next_run_at ON public.reminders(next_run_at);
CREATE INDEX IF NOT EXISTS idx_tags_is_folder ON public.tags(is_folder);
CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON public.tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_visible ON public.tags(visible);

-- ============================================================
-- TRIGGERS (DO blocks for idempotency)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'note_tags_notify_trigger' AND tgrelid = 'public.note_tags'::regclass) THEN
    CREATE TRIGGER note_tags_notify_trigger
      AFTER INSERT OR DELETE OR UPDATE ON public.note_tags
      FOR EACH ROW EXECUTE FUNCTION public.notify_note_tag_changes();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notes_notify_trigger' AND tgrelid = 'public.notes'::regclass) THEN
    CREATE TRIGGER notes_notify_trigger
      AFTER INSERT OR DELETE OR UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.notes_notify_changes();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_note_changes_trigger' AND tgrelid = 'public.notes'::regclass) THEN
    CREATE TRIGGER notify_note_changes_trigger
      AFTER INSERT OR DELETE OR UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.notify_note_changes();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tags_notify_trigger' AND tgrelid = 'public.tags'::regclass) THEN
    CREATE TRIGGER tags_notify_trigger
      AFTER INSERT OR DELETE OR UPDATE ON public.tags
      FOR EACH ROW EXECUTE FUNCTION public.notify_tag_changes();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_metadata_on_note_tag_change' AND tgrelid = 'public.note_tags'::regclass) THEN
    CREATE TRIGGER update_metadata_on_note_tag_change
      AFTER INSERT OR DELETE ON public.note_tags
      FOR EACH ROW EXECUTE FUNCTION public.update_note_metadata_on_note_tag_change();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_note_metadata_trigger' AND tgrelid = 'public.notes'::regclass) THEN
    CREATE TRIGGER update_note_metadata_trigger
      BEFORE INSERT OR UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.update_note_metadata();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notes_on_tag_change' AND tgrelid = 'public.tags'::regclass) THEN
    CREATE TRIGGER update_notes_on_tag_change
      AFTER DELETE OR UPDATE ON public.tags
      FOR EACH ROW EXECUTE FUNCTION public.update_note_metadata_on_tag_change();
  END IF;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at' AND tgrelid = 'public.users'::regclass) THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END; $$;

-- Repair legacy databases whose `settings` table predates the baseline
-- migration's `key TEXT PRIMARY KEY` (created by `CREATE TABLE IF NOT EXISTS`,
-- which silently skips an already-present table). Without the unique
-- constraint, ensureJwtSecret/rotateJwtSecret's `ON CONFLICT (key)` fails and
-- the server cannot start. Guarded so it is a no-op where the key is present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass
      AND contype IN ('p', 'u')
  ) THEN
    ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (key);
  END IF;
END $$;

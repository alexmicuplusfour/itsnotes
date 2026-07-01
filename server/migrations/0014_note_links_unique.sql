-- Remove duplicate link rows, keeping the best one per (note_id, url). Duplicates
-- can exist if the one-time link backfill ran before the advisory lock was added,
-- under cluster mode (PM2 -i) where several workers inserted the same URL at once.
-- Prefer a row that actually has a fetched preview, then the most recently fetched,
-- then the earliest created — so dedup never drops a populated card for an empty one.
DELETE FROM note_links
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      row_number() OVER (
        PARTITION BY note_id, url
        ORDER BY (title IS NOT NULL OR image_url IS NOT NULL) DESC,
                 fetched_at DESC NULLS LAST,
                 created_at ASC,
                 id ASC
      ) AS rn
    FROM note_links
  ) ranked
  WHERE rn > 1
);

-- Enforce one link row per (note_id, url) so a future race can never duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS note_links_note_id_url_uidx ON note_links (note_id, url);

-- Refresh prefetch/cache defaults to the tuned values shipped with the app.
-- Each UPDATE is conditional on the row still holding the ORIGINAL seeded default
-- from migrations 0002/0003, so any instance where the user changed the value in
-- Settings keeps their choice. Fresh installs get 0002/0003 then these updates.
--
--   CACHE_MAX_SIZE       stays 1000 (already the seeded default — no change)
--   PREFETCH_BATCH_SIZE  40  -> 10
--   BATCH_DELAY_MS       100 -> 300
--   CACHE_TTL_MS         ''  -> 7200000   (120 minutes)
--   PAGE_SIZE            80  -> 64
UPDATE settings SET value = '10'      WHERE key = 'PREFETCH_BATCH_SIZE' AND value = '40';
UPDATE settings SET value = '300'     WHERE key = 'BATCH_DELAY_MS'      AND value = '100';
UPDATE settings SET value = '7200000' WHERE key = 'CACHE_TTL_MS'        AND value = '';
UPDATE settings SET value = '64'      WHERE key = 'PAGE_SIZE'           AND value = '80';

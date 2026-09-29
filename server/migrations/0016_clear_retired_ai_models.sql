-- Clear saved AI model choices that no longer work (or soon won't), so the
-- server falls back to its built-in per-provider default (aiProvider.js
-- PROVIDER_DEFAULTS). An empty value is skipped when settings load, which is
-- what triggers that fallback.
--
-- 1. Retired models — cleared no matter who picked them: they're dead either way.
--    OpenAI: shut down already, or on Oct 23 2026, per OpenAI's deprecations page.
--    Claude: all of 2.x/3.x, Sonnet 4 and Opus 4 (retired Jun 15 2026) and
--    Opus 4.1 (retired Aug 5 2026), per Anthropic's model deprecations page.
UPDATE settings SET value = ''
WHERE key IN ('AI_MODEL_SUMMARIZE', 'AI_MODEL_OCR', 'AI_MODEL_REMINDER', 'AI_MODEL_AUTO_TAG')
  AND (
    value IN ('gpt-4', 'gpt-4.1-nano', 'gpt-4.5-preview', 'o1', 'o1-mini', 'o1-preview', 'o1-pro', 'o3-mini', 'o4-mini')
    OR value LIKE 'gpt-3.5-turbo%'
    OR value LIKE 'gpt-4-%'
    OR value IN ('claude-sonnet-4-20250514', 'claude-sonnet-4-0', 'claude-opus-4-20250514', 'claude-opus-4-0',
                 'claude-opus-4-1-20250805', 'claude-opus-4-1')
    OR value LIKE 'claude-3-%'
    OR value LIKE 'claude-2%'
    OR value LIKE 'claude-instant%'
  );

-- 2. The rest of 0002's seeded models still work but are years old. Same rule as
--    0008: only clear a row still holding the ORIGINAL seeded value, so fresh
--    installs pick up the current default instead of 0002's picks.
UPDATE settings SET value = '' WHERE key = 'AI_MODEL_SUMMARIZE' AND value = 'gpt-4o-mini';
UPDATE settings SET value = '' WHERE key = 'AI_MODEL_OCR'       AND value = 'gpt-4o-mini';
UPDATE settings SET value = '' WHERE key = 'AI_MODEL_AUTO_TAG'  AND value = 'gpt-4o';

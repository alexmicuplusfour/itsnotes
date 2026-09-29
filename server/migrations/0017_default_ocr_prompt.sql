-- Give OCR a real core prompt. 0002 seeded it empty, so fresh installs sent the
-- image with no instruction: models described the picture instead of copying
-- its text, and Claude's API rejects an empty text block outright. The core
-- prompt is read-only in the UI (users only append to AI_PROMPT_OCR_CUSTOM), so
-- overwriting it here does not clobber any user customization — same as 0005.
UPDATE settings
SET value = 'Extract all text from this image exactly as written, including handwriting. Keep the original line breaks and reading order. Return only the extracted text as plain text, with no commentary, descriptions or formatting. If there is no readable text, say so in one short sentence.'
WHERE key = 'AI_PROMPT_OCR';

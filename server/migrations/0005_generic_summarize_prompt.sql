-- Replace the opinionated personal "cognitive trigger" summarize prompt with a
-- generic default suitable for sharing. The core prompt is read-only in the UI
-- (users only append to AI_PROMPT_SUMMARIZE_CUSTOM), so overwriting it here does
-- not clobber any user customization.
UPDATE settings
SET value = 'Summarize the following note concisely. Capture the key points, main ideas, and any important details or action items. Keep it clear and well-structured.'
WHERE key = 'AI_PROMPT_SUMMARIZE';

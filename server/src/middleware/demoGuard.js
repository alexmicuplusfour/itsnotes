const demoReset = require('../services/demoReset');

const blockInDemo = (req, res, next) => {
  if (demoReset.isEnabled()) {
    return res.status(403).json({ message: 'This action is disabled in demo mode.' });
  }
  next();
};

// Cap note text size in demo mode so one visitor can't bloat the shared
// instance. This is purely a text cap: inline images are stored by reference
// (the note body only carries tiny `data-image-id` tags), so image bytes never
// count here — those are bounded separately by the per-image cap in the images
// route. ~100K chars is far beyond any real note while killing paste-spam.
const DEMO_MAX_CONTENT_CHARS = 100 * 1024;
const DEMO_MAX_TITLE_CHARS = 1024;

const limitNoteSizeInDemo = (req, res, next) => {
  if (!demoReset.isEnabled()) return next();
  const { title, content } = req.body || {};
  if (typeof content === 'string' && content.length > DEMO_MAX_CONTENT_CHARS) {
    return res.status(413).json({ message: 'Note is too large for the demo (max ~100KB of text).' });
  }
  if (typeof title === 'string' && title.length > DEMO_MAX_TITLE_CHARS) {
    return res.status(413).json({ message: 'Note title is too long for the demo.' });
  }
  next();
};

module.exports = { blockInDemo, limitNoteSizeInDemo, DEMO_MAX_CONTENT_CHARS, DEMO_MAX_TITLE_CHARS };

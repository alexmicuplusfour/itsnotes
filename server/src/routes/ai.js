const express = require('express');
const router = express.Router();
const multer = require('multer');
const { combinePrompts } = require('../constants/aiPrompts');
const { getAIProvider, getDefaultModel } = require('../services/aiProvider');
const { convertHtmlToPlainText } = require('../utils/htmlToPlainText');
const { respondAIError } = require('../utils/aiErrorResponse');
const { blockInDemo } = require('../middleware/demoGuard');

// Cap OCR uploads: both vision APIs reject images larger than this anyway,
// so without a limit an oversized image gets fully buffered and base64'd
// just to fail at the provider.
const OCR_MAX_BYTES = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OCR_MAX_BYTES },
});

// Run multer ourselves so a too-large file becomes a clean 413 (with a
// `message` the client toast displays) instead of an unhandled multer error.
const ocrUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Image is too large (max 10MB).' });
      }
      return next(err);
    }
    next();
  });
};

router.get('/models', async (req, res) => {
  const provider = process.env.AI_PROVIDER || 'openai';
  // Ollama needs no API key — reachability is checked by the call itself.
  const hasKey = provider === 'ollama' ? true
    : provider === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.OPENAI_API_KEY;

  if (!hasKey) {
    return res.json({ models: [], provider });
  }

  try {
    const aiProvider = getAIProvider();
    const models = await aiProvider.listModels();
    // Recommended model per feature, keyed by settings key so the client can
    // use them directly. The client only applies one if it's actually in
    // `models`, so a stale default degrades gracefully.
    const defaults = {
      AI_MODEL_AUTO_TAG: getDefaultModel('autoTag'),
      AI_MODEL_SUMMARIZE: getDefaultModel('summarize'),
      AI_MODEL_OCR: getDefaultModel('ocr'),
      AI_MODEL_REMINDER: getDefaultModel('reminder'),
    };
    res.json({ models, provider, defaults });
  } catch (error) {
    console.error('AI models error:', error);
    respondAIError(res, error, 'Failed to fetch models');
  }
});

router.post('/suggest-tags', blockInDemo, async (req, res) => {
  try {
    const { noteContent, availableTags } = req.body;

    if (!noteContent) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    if (!availableTags || !Array.isArray(availableTags) || availableTags.length === 0) {
      return res.status(400).json({ message: 'No available tags to choose from' });
    }

    // The client sends the note's stored HTML. Strip it to clean plain text so the
    // model reads the actual content, not markup, image tags, or img alt/filename noise.
    const plainContent = convertHtmlToPlainText(noteContent);

    if (!plainContent) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const corePrompt = process.env.AI_PROMPT_AUTO_TAG || '';
    const customAdditions = process.env.AI_PROMPT_AUTO_TAG_CUSTOM || '';
    const basePrompt = combinePrompts(corePrompt, customAdditions);

    const prompt = `
      ${basePrompt}

      Here is the note content:
      "${plainContent}"

      Here is the list of available tags:
      ${availableTags.map(t => `- ${t.name}`).join('\n')}
    `;

    const provider = getAIProvider();
    const model = process.env.AI_MODEL_AUTO_TAG || getDefaultModel('autoTag');
    const content = await provider.chat({
      messages: [{ role: 'user', content: prompt }],
      model,
      jsonResponse: true,
    });

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      return res.status(500).json({ message: 'The AI returned an unusable answer — try again or pick a different model.' });
    }

    const suggestedTagNames = result.tags || [];
    const suggestedTags = availableTags.filter(tag =>
      suggestedTagNames.some(name => name.toLowerCase() === tag.name.toLowerCase())
    );

    res.json({ tags: suggestedTags });

  } catch (error) {
    console.error('AI Tagging error:', error);
    respondAIError(res, error, 'Failed to suggest tags');
  }
});

router.post('/summarize', blockInDemo, async (req, res) => {
  try {
    const { noteContent } = req.body;

    if (!noteContent) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    // The client sends the note's stored HTML. Strip it to clean plain text so the
    // model summarizes the actual content, not markup or image tags.
    const plainContent = convertHtmlToPlainText(noteContent);

    if (!plainContent) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    const corePrompt = process.env.AI_PROMPT_SUMMARIZE || '';
    const customAdditions = process.env.AI_PROMPT_SUMMARIZE_CUSTOM || '';
    const systemPrompt = combinePrompts(corePrompt, customAdditions);

    const provider = getAIProvider();
    const model = process.env.AI_MODEL_SUMMARIZE || getDefaultModel('summarize');
    const summary = await provider.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: plainContent }],
      model,
    });

    res.json({ summary });

  } catch (error) {
    console.error('AI Summarization error:', error);
    respondAIError(res, error, 'Failed to summarize note');
  }
});

router.post('/ocr', blockInDemo, ocrUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const corePrompt = process.env.AI_PROMPT_OCR || '';
    const customAdditions = process.env.AI_PROMPT_OCR_CUSTOM || '';
    const ocrPrompt = combinePrompts(corePrompt, customAdditions);

    const provider = getAIProvider();
    const model = process.env.AI_MODEL_OCR || getDefaultModel('ocr');
    const text = await provider.chatWithVision({
      prompt: ocrPrompt,
      imageBase64: base64Image,
      mimeType,
      model,
    });

    res.json({ text });

  } catch (error) {
    console.error('AI OCR error:', error);
    respondAIError(res, error, 'Failed to extract text');
  }
});

module.exports = router;

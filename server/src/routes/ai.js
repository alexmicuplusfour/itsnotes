const express = require('express');
const router = express.Router();
const multer = require('multer');
const { combinePrompts } = require('../constants/aiPrompts');
const { getAIProvider, getDefaultModel } = require('../services/aiProvider');
const { convertHtmlToPlainText } = require('../utils/htmlToPlainText');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/models', async (req, res) => {
  const provider = process.env.AI_PROVIDER || 'openai';
  const hasKey = provider === 'anthropic'
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.OPENAI_API_KEY;

  if (!hasKey) {
    return res.json({ models: [], provider });
  }

  try {
    const aiProvider = getAIProvider();
    const models = await aiProvider.listModels();
    res.json({ models, provider });
  } catch (error) {
    console.error('AI models error:', error);
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid API key' });
    }
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

router.post('/suggest-tags', async (req, res) => {
  try {
    const { noteContent, availableTags } = req.body;

    if (!noteContent) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    if (!availableTags || !Array.isArray(availableTags) || availableTags.length === 0) {
      return res.status(400).json({ error: 'No available tags to choose from' });
    }

    // The client sends the note's stored HTML. Strip it to clean plain text so the
    // model reads the actual content, not markup, image tags, or img alt/filename noise.
    const plainContent = convertHtmlToPlainText(noteContent);

    if (!plainContent) {
      return res.status(400).json({ error: 'Note content is required' });
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
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    const suggestedTagNames = result.tags || [];
    const suggestedTags = availableTags.filter(tag =>
      suggestedTagNames.some(name => name.toLowerCase() === tag.name.toLowerCase())
    );

    res.json({ tags: suggestedTags });

  } catch (error) {
    console.error('AI Tagging error:', error);
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid API key' });
    }
    res.status(500).json({ error: 'Failed to suggest tags' });
  }
});

router.post('/summarize', async (req, res) => {
  try {
    const { noteContent } = req.body;

    if (!noteContent) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // The client sends the note's stored HTML. Strip it to clean plain text so the
    // model summarizes the actual content, not markup or image tags.
    const plainContent = convertHtmlToPlainText(noteContent);

    if (!plainContent) {
      return res.status(400).json({ error: 'Note content is required' });
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
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid API key' });
    }
    res.status(500).json({ error: 'Failed to summarize note' });
  }
});

router.post('/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
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
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid API key' });
    }
    res.status(500).json({ error: 'Failed to extract text' });
  }
});

module.exports = router;

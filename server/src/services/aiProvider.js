const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class OpenAIProvider {
  _client() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  }

  async chat({ system, messages, model, jsonResponse = false }) {
    const client = this._client();
    const allMessages = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const params = { model, messages: allMessages };
    if (jsonResponse) params.response_format = { type: 'json_object' };

    const completion = await client.chat.completions.create(params);
    return completion.choices[0].message.content;
  }

  async chatWithVision({ prompt, imageBase64, mimeType, model }) {
    const client = this._client();
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const completion = await client.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    });
    return completion.choices[0].message.content;
  }

  async listModels() {
    const client = this._client();
    const response = await client.models.list();
    return response.data
      .filter(m =>
        /^(gpt-4|gpt-3\.5|o\d)/.test(m.id) &&
        !m.id.includes(':') &&
        !m.id.includes('instruct') &&
        !m.id.includes('realtime') &&
        !m.id.includes('audio') &&
        !m.id.includes('search')
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(m => ({ id: m.id, name: m.id }));
  }
}

class AnthropicProvider {
  _client() {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  }

  async chat({ system, messages, model, jsonResponse = false }) {
    const client = this._client();

    let systemPrompt = system || '';
    if (jsonResponse) {
      const jsonInstruction = 'Respond with valid JSON only. No other text, no markdown code fences.';
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${jsonInstruction}` : jsonInstruction;
    }

    const params = { model, max_tokens: 4096, messages };
    if (systemPrompt) params.system = systemPrompt;

    const response = await client.messages.create(params);
    return response.content[0].text;
  }

  async chatWithVision({ prompt, imageBase64, mimeType, model }) {
    const client = this._client();

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });
    return response.content[0].text;
  }

  async listModels() {
    const client = this._client();
    const page = await client.models.list();
    return page.data
      .map(m => ({ id: m.id, name: m.display_name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

function stripCodeFences(text) {
  return text.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(error) {
  if (!error.status) return true; // network/timeout error
  return error.status === 429 || error.status >= 500;
}

async function withRetry(fn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt === MAX_RETRIES) throw error;
      const retryAfterSec = error.headers?.get?.('retry-after');
      const delay = retryAfterSec
        ? parseFloat(retryAfterSec) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`AI request failed (${error.status || 'network'}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function getAIProvider() {
  const provider = process.env.AI_PROVIDER || 'openai';
  const instance = provider === 'anthropic' ? new AnthropicProvider() : new OpenAIProvider();

  const originalChat = instance.chat.bind(instance);
  instance.chat = async (opts) => {
    const result = await withRetry(() => originalChat(opts));
    return opts.jsonResponse ? stripCodeFences(result) : result;
  };

  const originalChatWithVision = instance.chatWithVision.bind(instance);
  instance.chatWithVision = async (opts) => withRetry(() => originalChatWithVision(opts));

  return instance;
}

const PROVIDER_DEFAULTS = {
  openai:    { autoTag: 'gpt-4o-mini', summarize: 'gpt-4o-mini', ocr: 'gpt-4o-mini', reminder: 'o3-mini' },
  anthropic: { autoTag: 'claude-sonnet-4-6', summarize: 'claude-sonnet-4-6', ocr: 'claude-sonnet-4-6', reminder: 'claude-sonnet-4-6' },
};

function getDefaultModel(feature) {
  const provider = process.env.AI_PROVIDER || 'openai';
  return (PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai)[feature] || 'gpt-4o-mini';
}

module.exports = { getAIProvider, getDefaultModel };

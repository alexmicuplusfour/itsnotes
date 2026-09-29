const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// Ceiling, not target — on thinking-capable Claude models this budget is
// shared between internal reasoning and the answer, so it needs generous
// headroom (4096 could be eaten entirely by thinking, leaving no text).
// ~16K is also the practical max for non-streaming requests.
const MAX_TOKENS = 16000;

// An answer with no text (e.g. an OpenAI refusal, or a Claude response whose
// whole token budget went to thinking) is an error, not an empty success —
// returning '' would let routes reply with { summary: '' } and the client
// would leave its "✨ Generating..." placeholder stuck in the note.
// Deterministic, so not worth retrying.
function noTextError(detail) {
  const err = new Error(`AI returned no text (${detail})`);
  err.nonRetryable = true;
  return err;
}

// Local reasoning models (DeepSeek-R1, Qwen3, ...) served through Ollama can
// emit their chain of thought inline as <think>...</think> before the actual
// answer, which would corrupt summaries and break JSON.parse. Strip it.
function stripThinkTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Thinking-capable Claude models put a "thinking" block before the answer,
// so content[0] is not necessarily text — and responses can legally contain
// more than one text block. Join every text block.
function extractText(response) {
  // Newer Claude models run safety classifiers that can decline a request:
  // HTTP 200, stop_reason "refusal", and no text (or a cut-off start). An
  // automatic retry would just repeat the verdict, so tell the user plainly.
  if (response.stop_reason === 'refusal') {
    const err = new Error('Claude declined this request. If that seems wrong, pick a different model in Settings → AI.');
    err.nonRetryable = true;
    throw err;
  }
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  if (!text) {
    throw noTextError(`stop_reason: ${response.stop_reason}`);
  }
  return text;
}

// Cloud APIs answer in seconds; a hung request shouldn't hold the connection
// for the SDK-default 10 minutes. Local Ollama is a different world: model
// cold-loads (10-60s) plus CPU inference on long notes need generous room.
const CLOUD_TIMEOUT_MS = 60 * 1000;
const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000;

class OpenAIProvider {
  _client() {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: CLOUD_TIMEOUT_MS,
    });
  }

  // Extra request fields for this backend. OpenAI's docs say newer accounts
  // store Chat Completions by default — note text shouldn't sit in its logs.
  async _extraParams() {
    return { store: false };
  }

  async chat({ system, messages, model, jsonResponse = false }) {
    const client = this._client();
    const allMessages = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const params = { model, messages: allMessages, ...(await this._extraParams()) };
    if (jsonResponse) params.response_format = { type: 'json_object' };

    const completion = await client.chat.completions.create(params);
    const content = completion.choices[0].message.content;
    if (!content) {
      throw noTextError(`finish_reason: ${completion.choices[0].finish_reason}`);
    }
    return content;
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
      ...(await this._extraParams()),
    });
    const content = completion.choices[0].message.content;
    if (!content) {
      throw noTextError(`finish_reason: ${completion.choices[0].finish_reason}`);
    }
    return content;
  }

  async listModels() {
    const client = this._client();
    const response = await client.models.list();
    // OpenAI's list includes everything the key can touch (speech, image
    // gen, embeddings, moderation...). Keep only chat-capable families and
    // weed out variants that can't serve this app's chat/vision calls.
    const EXCLUDED_SUBSTRINGS = [
      ':',                                       // fine-tunes
      'instruct', 'realtime', 'audio', 'search', // not plain chat
      'transcribe', 'tts',                       // audio despite chat-ish names
      'codex', '-pro', 'deep-research', '-cyber', // responses-API only — would error here
    ];
    return response.data
      .filter(m =>
        /^(gpt-\d|o\d)/.test(m.id) &&
        !EXCLUDED_SUBSTRINGS.some(s => m.id.includes(s)) &&
        !/\d{4}-\d{2}-\d{2}/.test(m.id)          // dated snapshots — the alias covers them
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(m => ({ id: m.id, name: m.id }));
  }
}

class AnthropicProvider {
  _client() {
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: CLOUD_TIMEOUT_MS,
    });
  }

  async chat({ system, messages, model, jsonResponse = false }) {
    const client = this._client();

    let systemPrompt = system || '';
    if (jsonResponse) {
      const jsonInstruction = 'Respond with valid JSON only. No other text, no markdown code fences.';
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${jsonInstruction}` : jsonInstruction;
    }

    const params = { model, max_tokens: MAX_TOKENS, messages };
    if (systemPrompt) params.system = systemPrompt;

    const response = await client.messages.create(params);
    return extractText(response);
  }

  async chatWithVision({ prompt, imageBase64, mimeType, model }) {
    const client = this._client();

    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
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
    return extractText(response);
  }

  async listModels() {
    const client = this._client();
    // The API pages this list (20 per page by default); iterating the result
    // walks every page, so older models never silently drop off the end.
    const models = [];
    for await (const m of client.models.list({ limit: 100 })) {
      models.push({ id: m.id, name: m.display_name || m.id });
    }
    return models.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function getOllamaBaseUrl() {
  // Tolerate trailing slashes and a pasted-in /v1 suffix (other apps' docs
  // teach the /v1 form) — we append /v1 ourselves.
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '');
}

// reasoning_effort "none" turns thinking off on any model from Ollama v0.31.2
// (Jul 2026) on; earlier builds mishandled JSON mode with thinking off. Older
// or non-Ollama servers (no /api/version) just keep their default.
async function ollamaCanSkipThinking() {
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const [major, minor, patch] = String((await res.json()).version).split('.').map(n => parseInt(n, 10));
    return major > 0 || minor > 31 || (minor === 31 && patch >= 2);
  } catch {
    return false;
  }
}

// Ollama's native /api/tags reports what each model can do (completion,
// vision, embedding…); /v1/models doesn't. Null on servers without it.
async function ollamaCapabilities() {
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const { models = [] } = await res.json();
    return new Map(models.filter(m => m.capabilities?.length).map(m => [m.name, m.capabilities]));
  } catch {
    return null;
  }
}

// Ollama exposes an OpenAI-compatible endpoint at <base>/v1 (chat, vision via
// base64 data URLs, response_format, model listing), so this rides on the
// OpenAI SDK — only the client target, the extra request fields, the model
// list, and reasoning-model <think> cleanup differ.
class OllamaProvider extends OpenAIProvider {
  _client() {
    return new OpenAI({
      baseURL: `${getOllamaBaseUrl()}/v1`,
      apiKey: 'ollama', // required by the SDK, ignored by Ollama
      maxRetries: 0,
      timeout: OLLAMA_TIMEOUT_MS,
    });
  }

  // Thinking models (gemma4, qwen3.5, deepseek-r1…) reason before answering
  // by default. On local hardware that took minutes even for a one-line
  // reminder, and could fill Ollama's small default context before any answer
  // came out — so switch it off for every job, where the server handles that
  // cleanly. No `store`: that's an OpenAI-only field.
  async _extraParams() {
    return (await ollamaCanSkipThinking()) ? { reasoning_effort: 'none' } : {};
  }

  async chat(opts) {
    const text = stripThinkTags(await super.chat(opts));
    if (!text) throw noTextError('response contained only <think> reasoning');
    return text;
  }

  async chatWithVision(opts) {
    const text = stripThinkTags(await super.chatWithVision(opts));
    if (!text) throw noTextError('response contained only <think> reasoning');
    return text;
  }

  async listModels() {
    const client = this._client();
    const [response, capabilities] = await Promise.all([client.models.list(), ollamaCapabilities()]);
    // Every locally pulled model is listed; keep the ones that can chat.
    // Without capability info (older Ollama), drop anything named like an
    // embedding model.
    const canChat = (id) => capabilities?.has(id)
      ? capabilities.get(id).includes('completion')
      : !id.includes('embed');
    return response.data
      .filter(m => canChat(m.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      // Cloud models (tag "cloud" or "…-cloud") run on ollama.com, not locally.
      .map(m => ({ id: m.id, name: /[:-]cloud$/.test(m.id) ? `${m.id} (cloud)` : m.id }));
  }
}

function stripCodeFences(text) {
  return text.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// SDKs bury the socket-level code under nested causes (APIConnectionError →
// fetch TypeError → AggregateError), so walk the chain to find it.
function connectionErrorCode(error) {
  let e = error;
  for (let i = 0; e && i < 5; i++) {
    if (e.code) return e.code;
    if (Array.isArray(e.errors) && e.errors[0]?.code) return e.errors[0].code;
    e = e.cause;
  }
  return undefined;
}

function isRetryable(error) {
  if (error.nonRetryable) return false;
  // Nothing is listening (Ollama not running, wrong base URL) — retrying
  // won't change that.
  const code = connectionErrorCode(error);
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return false;
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
  const instance =
    provider === 'anthropic' ? new AnthropicProvider() :
    provider === 'ollama' ? new OllamaProvider() :
    new OpenAIProvider();

  // No model can happen when AI_PROVIDER is set by env and Settings → AI was
  // never visited (Ollama has no hardcoded default). Fail with a pointer, not
  // a cryptic provider error.
  const requireModel = (opts) => {
    if (!opts.model) {
      const err = new Error('No AI model configured — pick one in Settings → AI.');
      err.nonRetryable = true;
      throw err;
    }
  };

  // A 404 from a chat call means the saved model itself is gone — retired by
  // the provider, or deleted from Ollama. Name it and point at the fix:
  // opening Settings → AI swaps in one that's available.
  const withModelCheck = async (opts, call) => {
    try {
      return await withRetry(call);
    } catch (error) {
      if (error.status !== 404) throw error;
      const err = new Error(`The AI model "${opts.model}" isn't available — open Settings → AI to pick another.`);
      err.nonRetryable = true;
      throw err;
    }
  };

  const originalChat = instance.chat.bind(instance);
  instance.chat = async (opts) => {
    requireModel(opts);
    const result = await withModelCheck(opts, () => originalChat(opts));
    return opts.jsonResponse ? stripCodeFences(result) : result;
  };

  const originalChatWithVision = instance.chatWithVision.bind(instance);
  instance.chatWithVision = async (opts) => {
    requireModel(opts);
    return withModelCheck(opts, () => originalChatWithVision(opts));
  };

  return instance;
}

const PROVIDER_DEFAULTS = {
  openai:    { autoTag: 'gpt-6-luna', summarize: 'gpt-6-luna', ocr: 'gpt-6-luna', reminder: 'gpt-6-luna' },
  anthropic: { autoTag: 'claude-sonnet-5-5', summarize: 'claude-sonnet-5-5', ocr: 'claude-sonnet-5-5', reminder: 'claude-sonnet-5-5' },
  // No universal default exists for Ollama — the list is whatever the user
  // has pulled. The client falls back to the first available local model.
  ollama:    {},
};

function getDefaultModel(feature) {
  const provider = process.env.AI_PROVIDER || 'openai';
  return (PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai)[feature] || null;
}

module.exports = { getAIProvider, getDefaultModel, getOllamaBaseUrl, connectionErrorCode };

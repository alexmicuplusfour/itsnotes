const http = require('http');
const { getAIProvider, getDefaultModel } = require('./aiProvider');

// One fake server stands in for OpenAI, Anthropic and Ollama. Tests set
// `state` for what the Ollama side reports; chat request bodies land in `sent`.
let server;
let state;
const sent = [];

const json = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

const anthropicModels = Array.from({ length: 25 }, (_, i) => ({
  type: 'model', id: `claude-test-${String(i).padStart(2, '0')}`, display_name: `Claude Test ${String(i).padStart(2, '0')}`, created_at: '2026-01-01T00:00:00Z',
}));

function handle(req, res, body) {
  const url = new URL(req.url, 'http://x');
  const payload = body ? JSON.parse(body) : {};
  const gone = payload.model === 'gone';

  switch (`${req.method} ${url.pathname}`) {
    case 'GET /openai/v1/models':
      return json(res, { object: 'list', data: state.openaiModels.map(id => ({ id, object: 'model', created: 0, owned_by: 'openai' })) });
    case 'POST /openai/v1/chat/completions':
    case 'POST /ollama/v1/chat/completions':
      sent.push(payload);
      if (gone) return json(res, { error: { message: 'The model `gone` does not exist', type: 'invalid_request_error', code: 'model_not_found' } }, 404);
      return json(res, { id: 'c', object: 'chat.completion', created: 0, model: payload.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '<think>hmm</think>{"ok":true}' } }] });

    case 'GET /anthropic/v1/models': {
      // Pages of 10 regardless of the requested limit, to force paging.
      const after = url.searchParams.get('after_id');
      const start = after ? anthropicModels.findIndex(m => m.id === after) + 1 : 0;
      const data = anthropicModels.slice(start, start + 10);
      return json(res, { data, has_more: start + data.length < anthropicModels.length, first_id: data[0]?.id, last_id: data.at(-1)?.id });
    }
    case 'POST /anthropic/v1/messages': {
      if (gone) return json(res, { type: 'error', error: { type: 'not_found_error', message: 'model: gone' } }, 404);
      const refused = payload.model === 'refuser';
      return json(res, {
        id: 'm', type: 'message', role: 'assistant', model: payload.model,
        content: refused ? [] : [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'hello' }],
        stop_reason: refused ? 'refusal' : 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }

    case 'GET /ollama/api/version':
      return state.ollamaVersion ? json(res, { version: state.ollamaVersion }) : json(res, { error: 'not found' }, 404);
    case 'GET /ollama/api/tags':
      return state.ollamaTags ? json(res, { models: state.ollamaTags }) : json(res, { error: 'not found' }, 404);
    case 'GET /ollama/v1/models':
      return json(res, { object: 'list', data: state.ollamaModels.map(id => ({ id, object: 'model', created: 0, owned_by: 'library' })) });
    default:
      return json(res, { error: 'unexpected' }, 500);
  }
}

const savedEnv = { ...process.env };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handle(req, res, body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, {
    OPENAI_API_KEY: 'test', OPENAI_BASE_URL: `${base}/openai/v1`,
    ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: `${base}/anthropic`,
    OLLAMA_BASE_URL: `${base}/ollama`,
  });
});

afterAll(async () => {
  process.env = savedEnv;
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  sent.length = 0;
  state = { openaiModels: [], ollamaModels: [], ollamaVersion: null, ollamaTags: null };
});

const useProvider = (name) => {
  process.env.AI_PROVIDER = name;
  return getAIProvider();
};

describe('OpenAI', () => {
  it('lists chat models, GPT-6 included, and drops ones this app cannot call', async () => {
    state.openaiModels = [
      'gpt-6-luna', 'gpt-6-sol', 'gpt-5.6-terra', 'gpt-4o', 'o4-mini',
      'gpt-5.6-cyber', 'gpt-5.5-pro', 'gpt-5.4-mini-2026-03-17', 'gpt-4o-mini-tts',
      'gpt-image-1', 'o3-deep-research', 'text-embedding-3-small', 'ft:gpt-4o:me:x:1',
    ];
    const ids = (await useProvider('openai').listModels()).map(m => m.id);
    expect(ids).toEqual(['gpt-4o', 'gpt-5.6-terra', 'gpt-6-luna', 'gpt-6-sol', 'o4-mini']);
  });

  it('asks OpenAI not to store requests', async () => {
    const provider = useProvider('openai');
    await provider.chat({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'hi' }] });
    await provider.chatWithVision({ model: 'gpt-6-luna', prompt: 'x', imageBase64: 'AA==', mimeType: 'image/png' });
    expect(sent.map(b => b.store)).toEqual([false, false]);
    expect(sent[0].reasoning_effort).toBeUndefined();
  });

  it('names a missing model and points at Settings', async () => {
    await expect(useProvider('openai').chat({ model: 'gone', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ nonRetryable: true, message: expect.stringMatching(/"gone" isn't available.*Settings/) });
  });

  it('defaults to gpt-6-luna', () => {
    process.env.AI_PROVIDER = 'openai';
    expect(getDefaultModel('ocr')).toBe('gpt-6-luna');
  });
});

describe('Anthropic', () => {
  it('reads every page of the model list', async () => {
    expect(await useProvider('anthropic').listModels()).toHaveLength(25);
  });

  it('returns the text that follows a thinking block', async () => {
    expect(await useProvider('anthropic').chat({ model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'hi' }] }))
      .toBe('hello');
  });

  it('explains a refusal instead of reporting an empty answer', async () => {
    await expect(useProvider('anthropic').chat({ model: 'refuser', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ nonRetryable: true, message: expect.stringContaining('Claude declined') });
  });

  it('names a missing model and points at Settings', async () => {
    await expect(useProvider('anthropic').chatWithVision({ model: 'gone', prompt: 'x', imageBase64: 'AA==', mimeType: 'image/png' }))
      .rejects.toMatchObject({ nonRetryable: true, message: expect.stringMatching(/"gone" isn't available.*Settings/) });
  });

  it('defaults to claude-sonnet-5-5', () => {
    process.env.AI_PROVIDER = 'anthropic';
    expect(getDefaultModel('summarize')).toBe('claude-sonnet-5-5');
  });
});

describe('Ollama', () => {
  const job = { model: 'gemma4:latest', messages: [{ role: 'user', content: 'hi' }] };

  it('lists only chat-capable models and marks cloud ones', async () => {
    state.ollamaModels = ['gemma4:latest', 'bge-m3:latest', 'gpt-oss:120b-cloud'];
    state.ollamaTags = [
      { name: 'gemma4:latest', capabilities: ['completion', 'vision', 'thinking'] },
      { name: 'bge-m3:latest', capabilities: ['embedding'] },
      { name: 'gpt-oss:120b-cloud', capabilities: ['completion', 'thinking'] },
    ];
    // bge-m3 is an embedding model the old name filter let through.
    expect(await useProvider('ollama').listModels()).toEqual([
      { id: 'gemma4:latest', name: 'gemma4:latest' },
      { id: 'gpt-oss:120b-cloud', name: 'gpt-oss:120b-cloud (cloud)' },
    ]);
  });

  it('falls back to the name filter when Ollama reports no capabilities', async () => {
    state.ollamaModels = ['gemma4:latest', 'nomic-embed-text:latest'];
    const ids = (await useProvider('ollama').listModels()).map(m => m.id);
    expect(ids).toEqual(['gemma4:latest']);
  });

  it('turns thinking off on Ollama v0.31.2 and later', async () => {
    state.ollamaVersion = '0.31.2';
    await useProvider('ollama').chat(job);
    state.ollamaVersion = '0.40.0-rc0';
    await useProvider('ollama').chatWithVision({ ...job, prompt: 'x', imageBase64: 'AA==', mimeType: 'image/png' });
    expect(sent.map(b => b.reasoning_effort)).toEqual(['none', 'none']);
  });

  it('leaves thinking alone on older Ollama and non-Ollama servers', async () => {
    state.ollamaVersion = '0.31.1';
    await useProvider('ollama').chat(job);
    state.ollamaVersion = null; // no /api/version
    await useProvider('ollama').chat(job);
    expect(sent.map(b => b.reasoning_effort)).toEqual([undefined, undefined]);
  });

  it('never sends the OpenAI-only store field, and strips inline <think> blocks', async () => {
    state.ollamaVersion = '0.34.4';
    const text = await useProvider('ollama').chat({ ...job, jsonResponse: true });
    expect(text).toBe('{"ok":true}');
    expect(sent[0].store).toBeUndefined();
    expect(sent[0].response_format).toEqual({ type: 'json_object' });
  });
});

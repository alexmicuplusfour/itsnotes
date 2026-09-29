const { respondAIError } = require('./aiErrorResponse');

const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const respond = (provider, error) => {
  process.env.AI_PROVIDER = provider;
  const res = fakeRes();
  respondAIError(res, error, 'Failed to do the thing');
  return { status: res.status.mock.calls[0][0], message: res.json.mock.calls[0][0].message };
};

describe('respondAIError', () => {
  const saved = process.env.AI_PROVIDER;
  afterAll(() => {
    if (saved === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = saved;
  });

  it('shows our own user-facing errors as-is', () => {
    const err = Object.assign(new Error('The AI model "x" isn\'t available — open Settings → AI to pick another.'), { nonRetryable: true });
    expect(respond('openai', err)).toEqual({ status: 400, message: err.message });
  });

  it("passes Ollama's request errors through", () => {
    const err = Object.assign(new Error('400 too long'), { status: 400, error: { message: 'input exceeds the context window' } });
    expect(respond('ollama', err)).toEqual({ status: 400, message: 'Ollama: input exceeds the context window' });
  });

  it('unwraps double-wrapped Ollama errors and explains a text-only model sent an image', () => {
    // Shape seen live from Ollama 0.32.5 when OCR used llama3.2.
    const inner = JSON.stringify({ error: { code: 400, message: 'Multimodal data provided, but model does not support multimodal requests.', type: 'invalid_request_error' } });
    const err = Object.assign(new Error(`400 ${inner}`), { status: 400, error: { message: inner } });
    expect(respond('ollama', err).message).toBe("This model can't read images — pick one with vision support for OCR in Settings → AI.");
    const other = JSON.stringify({ error: { message: 'something specific' } });
    expect(respond('ollama', Object.assign(new Error('400'), { status: 400, error: { message: other } })).message)
      .toBe('Ollama: something specific');
  });

  it("handles Ollama's plain-string error bodies", () => {
    const err = Object.assign(new Error('401 "unauthorized"'), { status: 401, error: 'unauthorized' });
    expect(respond('ollama', err)).toEqual({ status: 400, message: 'Ollama: unauthorized' });
  });

  it("says when Ollama can't be reached", () => {
    expect(respond('ollama', new Error('fetch failed')).message).toMatch(/^Can't reach Ollama at /);
  });

  it('keeps the generic message for cloud providers', () => {
    expect(respond('openai', Object.assign(new Error('400 bad'), { status: 400 })))
      .toEqual({ status: 500, message: 'Failed to do the thing' });
    expect(respond('anthropic', Object.assign(new Error('401'), { status: 401 })).message).toBe('Invalid API key');
  });
});

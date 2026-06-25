const demoReset = require('../services/demoReset');
const { limitNoteSizeInDemo, DEMO_MAX_CONTENT_CHARS, DEMO_MAX_TITLE_CHARS } = require('./demoGuard');

// Drive the middleware directly with a fake req/res so we don't need a live
// server or DB. `next` being called means the request was allowed through.
function run(body) {
  const req = { body };
  let status = null;
  let json = null;
  let nextCalled = false;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { json = payload; return this; },
  };
  limitNoteSizeInDemo(req, res, () => { nextCalled = true; });
  return { status, json, nextCalled };
}

describe('limitNoteSizeInDemo', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is a no-op when demo mode is disabled, regardless of size', () => {
    jest.spyOn(demoReset, 'isEnabled').mockReturnValue(false);
    const { nextCalled, status } = run({ content: 'x'.repeat(DEMO_MAX_CONTENT_CHARS + 1) });
    expect(nextCalled).toBe(true);
    expect(status).toBeNull();
  });

  describe('in demo mode', () => {
    beforeEach(() => jest.spyOn(demoReset, 'isEnabled').mockReturnValue(true));

    it('allows normal-sized notes through', () => {
      const { nextCalled } = run({ title: 'A note', content: '<p>hello</p>' });
      expect(nextCalled).toBe(true);
    });

    it('allows content right at the limit', () => {
      const { nextCalled } = run({ content: 'x'.repeat(DEMO_MAX_CONTENT_CHARS) });
      expect(nextCalled).toBe(true);
    });

    it('rejects oversized content with 413', () => {
      const { nextCalled, status } = run({ content: 'x'.repeat(DEMO_MAX_CONTENT_CHARS + 1) });
      expect(nextCalled).toBe(false);
      expect(status).toBe(413);
    });

    it('rejects an oversized title with 413', () => {
      const { nextCalled, status } = run({ title: 'x'.repeat(DEMO_MAX_TITLE_CHARS + 1) });
      expect(nextCalled).toBe(false);
      expect(status).toBe(413);
    });

    it('tolerates a missing body', () => {
      const req = {};
      let nextCalled = false;
      limitNoteSizeInDemo(req, { status() { return this; }, json() { return this; } }, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });
});

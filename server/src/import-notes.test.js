const fs = require('fs');
const os = require('os');
const path = require('path');
const { usecToIso, resolveAttachmentPath, appendInlineImageRefs } = require('./import-notes');

// import-notes pulls in the shared Knex instance on require; close its pool so
// Jest exits cleanly. (No queries run in these tests, so no connection opens.)
afterAll(async () => {
  await require('./knex').db.destroy();
});

describe('usecToIso', () => {
  it('converts Keep microsecond timestamps to ISO', () => {
    expect(usecToIso(1700000000000000)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('falls back to the provided ISO when the value is missing', () => {
    expect(usecToIso(undefined, '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });

  it('falls back to the provided ISO when the value is non-numeric', () => {
    expect(usecToIso('not-a-number', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });

  it('falls back to a valid ISO timestamp ("now") when nothing is provided', () => {
    const out = usecToIso(undefined);
    expect(() => new Date(out).toISOString()).not.toThrow();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('does not throw on a NaN-producing input (the original bug)', () => {
    // new Date(NaN).toISOString() throws RangeError; the guard must not.
    expect(() => usecToIso(NaN)).not.toThrow();
  });
});

describe('resolveAttachmentPath', () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-attach-'));
    fs.writeFileSync(path.join(dir, 'photo.png'), 'x');
    fs.writeFileSync(path.join(dir, '12345.jpeg'), 'y'); // recorded as .jpg below
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('resolves a filePath that exists directly', () => {
    expect(resolveAttachmentPath(dir, 'photo.png')).toBe(path.join(dir, 'photo.png'));
  });

  it('falls back to a sibling with the same basename when the extension differs', () => {
    // Keep recorded "12345.jpg" but exported "12345.jpeg"
    expect(resolveAttachmentPath(dir, '12345.jpg')).toBe(path.join(dir, '12345.jpeg'));
  });

  it('returns null when nothing matches', () => {
    expect(resolveAttachmentPath(dir, 'nope.png')).toBeNull();
  });
});

describe('appendInlineImageRefs', () => {
  it('appends one data-image-id reference per imported image', () => {
    expect(appendInlineImageRefs('<p>hello</p>', [7, 8]))
      .toBe('<p>hello</p><img data-image-id="7"><img data-image-id="8">');
  });

  it('matches the shape Note.reconcileInlineImages scans for', () => {
    // The reconcile pass deletes any note_images row whose id is not matched
    // by this exact pattern in the body — the appended refs must satisfy it.
    const html = appendInlineImageRefs('<p>x</p>', [42]);
    const referenced = [...html.matchAll(/data-image-id="([^"]+)"/g)].map(m => m[1]);
    expect(referenced).toEqual(['42']);
  });

  it('returns the body unchanged when there are no images', () => {
    expect(appendInlineImageRefs('<p>hello</p>', [])).toBe('<p>hello</p>');
    expect(appendInlineImageRefs('<p>hello</p>', undefined)).toBe('<p>hello</p>');
  });

  it('tolerates an empty body', () => {
    expect(appendInlineImageRefs('', [3])).toBe('<img data-image-id="3">');
    expect(appendInlineImageRefs(null, [3])).toBe('<img data-image-id="3">');
  });
});

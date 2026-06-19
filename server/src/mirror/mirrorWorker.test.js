'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildDesired, scanOnDisk } = require('./mirrorWorker');

const note = (over = {}) => ({
  id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f',
  title: 'Hello',
  content: '<p>hi</p>',
  plainContent: 'hi',
  color: 'default',
  pinned: false,
  archived: false,
  trashed: false,
  created: '2026-06-19T10:00:00Z',
  updated: '2026-06-19T10:00:00Z',
  tags: [],
  folders: [],
  reminders: [],
  images: [],
  attachments: [],
  ...over,
});

describe('buildDesired', () => {
  test('assigns <slug>-<shortid>.md and a stable hash', async () => {
    const { desired, rendered } = await buildDesired([note()], new Map());
    expect(desired[0].relPath).toBe('hello-4f3c8a2b.md');
    expect(desired[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rendered.get(desired[0].noteId)).toContain('id: 4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f');
  });

  test('trashed notes land under trash/', async () => {
    const { desired } = await buildDesired([note({ trashed: true })], new Map());
    expect(desired[0].relPath).toBe('trash/hello-4f3c8a2b.md');
  });

  test('filename clash extends the shortid', async () => {
    const a = note({ id: '4f3c8a2b-1111-4e2a-9b11-7f0a2c3d4e5f', title: 'Dup' });
    const b = note({ id: '4f3c8a2b-2222-4e2a-9b11-7f0a2c3d4e5f', title: 'Dup' });
    const { desired } = await buildDesired([a, b], new Map());
    expect(desired[0].relPath).toBe('dup-4f3c8a2b.md');
    expect(desired[1].relPath).not.toBe(desired[0].relPath);
    expect(desired[1].relPath).toMatch(/^dup-4f3c8a2b-2222\.md$/);
  });

  test('resolveImage produces _resources links with the right extension', async () => {
    const n = note({
      content: '<p><img data-image-id="9" alt="x"></p>',
      images: [{ id: 9, type: 'image/jpeg' }],
    });
    const { desired, rendered } = await buildDesired([n], new Map());
    expect(rendered.get(desired[0].noteId)).toContain('![x](_resources/img-9.jpg)');
  });

  test('resolveObjectTitle fills object-card alt text', async () => {
    const n = note({
      content: '<div objectid="obj-1" objecttype="movie" data-type="object-card"></div>',
      title: 'Card',
    });
    const titles = new Map([['obj-1', 'Conclave']]);
    const { desired, rendered } = await buildDesired([n], titles);
    expect(rendered.get(desired[0].noteId)).toContain('![Conclave](object:obj-1)');
  });

  test('content change yields a different hash', async () => {
    const h1 = (await buildDesired([note()], new Map())).desired[0].hash;
    const h2 = (await buildDesired([note({ content: '<p>changed</p>' })], new Map())).desired[0].hash;
    expect(h1).not.toBe(h2);
  });
});

describe('scanOnDisk', () => {
  let dir;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-scan-'));
    await fs.writeFile(path.join(dir, 'a-111.md'), 'x');
    await fs.writeFile(path.join(dir, 'b-222.md'), 'x');
    await fs.writeFile(path.join(dir, 'notes.txt'), 'x'); // ignored (not .md)
    await fs.mkdir(path.join(dir, 'trash'));
    await fs.writeFile(path.join(dir, 'trash', 'c-333.md'), 'x');
    await fs.mkdir(path.join(dir, '_resources'));
    await fs.writeFile(path.join(dir, '_resources', 'img-1.png'), 'x');
  });
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  test('collects root and trash .md files, ignores others', async () => {
    const set = await scanOnDisk(dir);
    expect([...set].sort()).toEqual(['a-111.md', 'b-222.md', 'trash/c-333.md']);
  });

  test('missing directory yields an empty set', async () => {
    const set = await scanOnDisk(path.join(dir, 'does-not-exist'));
    expect(set.size).toBe(0);
  });
});

'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// In-memory stand-in for the DB layer so runOnce can be exercised end-to-end
// against a real temp folder without Postgres.
jest.mock('./mirrorRepo', () => {
  const tracked = new Map();
  // 1x1 transparent PNG.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let notes = [];
  return {
    __setNotes: (n) => { notes = n; },
    __tracked: tracked,
    loadNotes: jest.fn(async () => notes),
    loadNote: jest.fn(async (id) => notes.find((n) => n.id === id) || null),
    loadObjectTitles: jest.fn(async () => new Map()),
    loadImageData: jest.fn(async () => PNG),
    loadTracked: jest.fn(async () => new Map(tracked)),
    upsertTracked: jest.fn(async (id, rel, hash) => { tracked.set(id, { relPath: rel, hash }); }),
    deleteTracked: jest.fn(async (id) => { tracked.delete(id); }),
  };
});

const repo = require('./mirrorRepo');
const { runOnce, reconcileOne } = require('./mirrorWorker');

const baseNote = (over = {}) => ({
  id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f',
  title: 'Hello World',
  content: '<p>hi <strong>there</strong></p>',
  plainContent: 'hi there',
  color: 'default', pinned: false, archived: false, trashed: false,
  created: '2026-06-19T10:00:00Z', updated: '2026-06-19T10:00:00Z',
  tags: ['work'], folders: [], reminders: [], images: [], attachments: [],
  ...over,
});

describe('runOnce (end-to-end against a temp folder)', () => {
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-e2e-'));
    process.env.MD_MIRROR_ENABLED = 'true';
    process.env.MD_MIRROR_PATH = dir;
    repo.__tracked.clear();
  });
  afterEach(async () => {
    delete process.env.MD_MIRROR_ENABLED;
    delete process.env.MD_MIRROR_PATH;
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('initial sweep writes a note file with frontmatter + body', async () => {
    repo.__setNotes([baseNote()]);
    const summary = await runOnce();
    expect(summary.created).toBe(1);
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('id: 4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f');
    expect(file).toContain('tags: [work]');
    expect(file).toContain('hi **there**');
  });

  test('second sweep with no changes is a no-op', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    const summary = await runOnce();
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.renamed).toBe(0);
  });

  test('editing a note rewrites the file', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    repo.__setNotes([baseNote({ content: '<p>edited</p>' })]);
    const summary = await runOnce();
    expect(summary.updated).toBe(1);
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('edited');
  });

  test('renaming a note moves the file', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    repo.__setNotes([baseNote({ title: 'Renamed' })]);
    const summary = await runOnce();
    expect(summary.renamed).toBe(1);
    expect(await fs.readdir(dir)).toContain('renamed-4f3c8a2b.md');
    expect(await fs.readdir(dir)).not.toContain('hello-world-4f3c8a2b.md');
  });

  test('trashing a note moves it under trash/', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    repo.__setNotes([baseNote({ trashed: true })]);
    await runOnce();
    expect(await fs.readdir(path.join(dir, 'trash'))).toContain('hello-world-4f3c8a2b.md');
  });

  test('deleting a note removes the file and its tracking row', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    repo.__setNotes([]);
    const summary = await runOnce();
    expect(summary.deleted).toBe(1);
    expect(await fs.readdir(dir)).not.toContain('hello-world-4f3c8a2b.md');
    expect(repo.__tracked.size).toBe(0);
  });

  test('inline image bytes are written into _resources/', async () => {
    repo.__setNotes([baseNote({
      content: '<p><img data-image-id="9" alt="pic"></p>',
      images: [{ id: 9, type: 'image/png' }],
    })]);
    const summary = await runOnce();
    expect(summary.resourcesWritten).toBe(1);
    const bytes = await fs.readFile(path.join(dir, '_resources', 'img-9.png'));
    expect(bytes.length).toBeGreaterThan(0);
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('![pic](_resources/img-9.png)');
  });

  test('externally deleted file is recreated on the next sweep', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    await fs.unlink(path.join(dir, 'hello-world-4f3c8a2b.md'));
    const summary = await runOnce();
    expect(summary.updated).toBe(1);
    expect(await fs.readdir(dir)).toContain('hello-world-4f3c8a2b.md');
  });
});

describe('reconcileOne (live single-note fast path against a temp folder)', () => {
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-live-'));
    process.env.MD_MIRROR_ENABLED = 'true';
    process.env.MD_MIRROR_PATH = dir;
    repo.__tracked.clear();
  });
  afterEach(async () => {
    delete process.env.MD_MIRROR_ENABLED;
    delete process.env.MD_MIRROR_PATH;
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('writes a file for a newly notified note', async () => {
    repo.__setNotes([baseNote()]);
    const res = await reconcileOne(baseNote().id);
    expect(res.actions).toBe(1);
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('id: 4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f');
    expect(file).toContain('hi **there**');
  });

  test('rewrites the file when the note content changed', async () => {
    repo.__setNotes([baseNote()]);
    await reconcileOne(baseNote().id);
    repo.__setNotes([baseNote({ content: '<p>edited live</p>' })]);
    const res = await reconcileOne(baseNote().id);
    expect(res.actions).toBe(1);
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('edited live');
  });

  test('an unchanged note is a no-op', async () => {
    repo.__setNotes([baseNote()]);
    await reconcileOne(baseNote().id);
    const res = await reconcileOne(baseNote().id);
    expect(res.actions).toBe(0);
  });

  test('a vanished note deletes its file and tracking row', async () => {
    repo.__setNotes([baseNote()]);
    await reconcileOne(baseNote().id);
    repo.__setNotes([]); // note is gone; loadNote returns null
    const res = await reconcileOne(baseNote().id);
    expect(res.actions).toBe(1);
    expect(await fs.readdir(dir)).not.toContain('hello-world-4f3c8a2b.md');
    expect(repo.__tracked.size).toBe(0);
  });

  test('moves a newly-trashed note under trash/', async () => {
    repo.__setNotes([baseNote()]);
    await reconcileOne(baseNote().id);
    repo.__setNotes([baseNote({ trashed: true })]);
    await reconcileOne(baseNote().id);
    expect(await fs.readdir(path.join(dir, 'trash'))).toContain('hello-world-4f3c8a2b.md');
    expect(await fs.readdir(dir)).not.toContain('hello-world-4f3c8a2b.md');
  });
});

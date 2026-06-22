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
    loadTagIdsByName: jest.fn(async () => new Map([['work', 'tag-work-id']])),
    loadObjectTitles: jest.fn(async () => new Map()),
    loadImageData: jest.fn(async () => PNG),
    loadTracked: jest.fn(async () => new Map(tracked)),
    upsertTracked: jest.fn(async (id, rel, hash) => { tracked.set(id, { relPath: rel, hash }); }),
    deleteTracked: jest.fn(async (id) => { tracked.delete(id); }),
    // Import writes mutate the in-memory note list so a follow-up preview/sweep
    // sees the imported state, mirroring what the real Note/Tag models would do.
    importUpdateNote: jest.fn(async (id, fields) => {
      const n = notes.find((x) => x.id === id);
      if (!n) return;
      if (fields.title !== undefined) n.title = fields.title;
      if (fields.content !== undefined) n.content = fields.content;
      if (fields.color !== undefined) n.color = fields.color;
      if (fields.is_pinned !== undefined) n.pinned = fields.is_pinned;
      if (fields.is_archived !== undefined) n.archived = fields.is_archived;
      if (fields.is_deleted !== undefined) n.trashed = fields.is_deleted;
    }),
    importCreateNote: jest.fn(async (fields, created) => {
      const id = `gen-${notes.length + 1}`;
      notes.push({
        id, title: fields.title || '', content: fields.content || '',
        plainContent: '', color: fields.color || 'default',
        pinned: !!fields.is_pinned, archived: !!fields.is_archived, trashed: !!fields.is_deleted,
        created: created || '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
        tags: [], folders: [], reminders: [], images: [], attachments: [],
      });
      return id;
    }),
    syncNoteTags: jest.fn(async (id, { tags = [], folders = [] }) => {
      const n = notes.find((x) => x.id === id);
      if (n) { n.tags = tags; n.folders = folders; }
    }),
  };
});

const repo = require('./mirrorRepo');
const { runOnce, reconcileOne, gatherDiskFiles, previewImport, applyImport, autoImportTick } = require('./mirrorWorker');

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

  // Filenames are sticky: retitling a note in the app rewrites its file in place
  // rather than renaming it. The file only moves when the human renames the file.
  test('retitling a note keeps the original filename and rewrites it in place', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    repo.__setNotes([baseNote({ title: 'Renamed' })]);
    const summary = await runOnce();
    expect(summary.renamed).toBe(0);
    expect(summary.updated).toBe(1);
    const files = await fs.readdir(dir);
    expect(files).toContain('hello-world-4f3c8a2b.md');
    expect(files).not.toContain('renamed-4f3c8a2b.md');
    const file = await fs.readFile(path.join(dir, 'hello-world-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('title: Renamed');
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

  // Blank scratch notes (no title, no text, nothing attached) aren't valid files.
  const emptyNote = (over = {}) =>
    baseNote({ id: 'empty-1', title: '', content: '<p></p>', plainContent: '', tags: [], ...over });

  test('an empty note is not written to a file', async () => {
    repo.__setNotes([emptyNote()]);
    const summary = await runOnce();
    expect(summary.created).toBe(0);
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.md'))).toEqual([]);
  });

  test('a note that becomes empty has its file removed on the next sweep', async () => {
    repo.__setNotes([baseNote()]);
    await runOnce();
    expect(await fs.readdir(dir)).toContain('hello-world-4f3c8a2b.md');

    // Same note id, now blanked out.
    repo.__setNotes([baseNote({ title: '', content: '<p></p>', plainContent: '', tags: [] })]);
    const summary = await runOnce();
    expect(summary.deleted).toBe(1);
    expect(await fs.readdir(dir)).not.toContain('hello-world-4f3c8a2b.md');
  });

  test('a note with only an image is kept (not treated as empty)', async () => {
    repo.__setNotes([emptyNote({
      content: '<p><img data-image-id="9" alt="pic"></p>',
      images: [{ id: 9, type: 'image/png' }],
    })]);
    const summary = await runOnce();
    expect(summary.created).toBe(1);
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

  // Overlapping reconciles used to orphan a duplicate .md per overlap. The worker
  // now serializes them; combined with sticky filenames, a burst of edits keeps the
  // single original file (retitling never renames it) and just rewrites its body.
  test('concurrent reconciles for the same note leave a single file', async () => {
    repo.__setNotes([baseNote({ title: 'First Title' })]);
    await reconcileOne(baseNote().id);

    repo.__setNotes([baseNote({ title: 'Second Title' })]);
    const p1 = reconcileOne(baseNote().id);
    repo.__setNotes([baseNote({ title: 'Third Title' })]);
    const p2 = reconcileOne(baseNote().id);
    await Promise.all([p1, p2]);

    const mdFiles = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
    expect(mdFiles).toEqual(['first-title-4f3c8a2b.md']);
    const file = await fs.readFile(path.join(dir, 'first-title-4f3c8a2b.md'), 'utf8');
    expect(file).toContain('title: Third Title');
  });
});

describe('previewImport (read-only folder → DB dry run against a temp folder)', () => {
  const FILE = 'hello-world-4f3c8a2b.md';
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-import-'));
    process.env.MD_MIRROR_ENABLED = 'true';
    process.env.MD_MIRROR_PATH = dir;
    repo.__tracked.clear();
    repo.__setNotes([baseNote()]);
    await runOnce(); // seed the folder + tracking rows from one note
  });
  afterEach(async () => {
    delete process.env.MD_MIRROR_ENABLED;
    delete process.env.MD_MIRROR_PATH;
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('gatherDiskFiles fingerprints each file with its frontmatter id', async () => {
    const files = await gatherDiskFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0].relPath).toBe(FILE);
    expect(files[0].id).toBe(baseNote().id);
    expect(files[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('right after a sweep everything is unchanged', async () => {
    const plan = await previewImport();
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0]).toMatchObject({ noteId: baseNote().id, relPath: FILE });
    expect(plan.edited).toEqual([]);
    expect(plan.created).toEqual([]);
    expect(plan.renamed).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  test('editing a file on disk shows up as edited', async () => {
    const abs = path.join(dir, FILE);
    await fs.appendFile(abs, '\nedited by hand\n', 'utf8');
    const plan = await previewImport();
    expect(plan.edited).toHaveLength(1);
    expect(plan.edited[0]).toMatchObject({ noteId: baseNote().id, relPath: FILE });
    expect(plan.unchanged).toEqual([]);
  });

  test('a hand-added file with no tracked id is created', async () => {
    await fs.writeFile(path.join(dir, 'brand-new.md'), '# just text\n', 'utf8');
    const plan = await previewImport();
    expect(plan.created).toHaveLength(1);
    expect(plan.created[0]).toMatchObject({ relPath: 'brand-new.md', id: null });
    expect(plan.unchanged).toHaveLength(1); // the seeded note is still untouched
  });

  test('renaming a file on disk (id preserved) shows up as renamed, not missing', async () => {
    await fs.rename(path.join(dir, FILE), path.join(dir, 'renamed-by-hand.md'));
    const plan = await previewImport();
    expect(plan.renamed).toHaveLength(1);
    expect(plan.renamed[0]).toMatchObject({
      noteId: baseNote().id,
      oldPath: FILE,
      relPath: 'renamed-by-hand.md',
      alsoEdited: false,
    });
    expect(plan.missing).toEqual([]);
  });

  test('deleting a tracked file on disk shows up as missing', async () => {
    await fs.unlink(path.join(dir, FILE));
    const plan = await previewImport();
    expect(plan.missing).toHaveLength(1);
    expect(plan.missing[0]).toMatchObject({ noteId: baseNote().id, relPath: FILE });
  });

  test('skips cleanly when the feature is disabled', async () => {
    delete process.env.MD_MIRROR_ENABLED;
    expect(await previewImport()).toEqual({ skipped: true, reason: 'disabled' });
  });
});

describe('applyImport (folder → DB writes against a temp folder)', () => {
  const FILE = 'hello-world-4f3c8a2b.md';
  const ID = '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f';
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-apply-'));
    process.env.MD_MIRROR_ENABLED = 'true';
    process.env.MD_MIRROR_PATH = dir;
    repo.__tracked.clear();
    repo.__setNotes([baseNote()]);
    await runOnce(); // seed folder + tracking from one note
  });
  afterEach(async () => {
    delete process.env.MD_MIRROR_ENABLED;
    delete process.env.MD_MIRROR_PATH;
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('an edited file is pulled into the note, then reads back as unchanged', async () => {
    await fs.appendFile(path.join(dir, FILE), '\nedited by hand\n', 'utf8');
    const counts = await applyImport();
    expect(counts.edited).toBe(1);

    const [note] = await repo.loadNotes();
    expect(note.content).toContain('edited by hand');

    const after = await previewImport();
    expect(after.edited).toEqual([]);
    expect(after.conflict).toEqual([]);
    expect(after.unchanged).toHaveLength(1);
  });

  // The .md form keeps only `#work`; import must recover the tag's uuid from the DB
  // so the inline mention isn't stripped of its data-tag-id on the round-trip.
  test('an imported tag mention recovers its data-tag-id from the DB', async () => {
    repo.__setNotes([baseNote({
      content: '<p><span data-type="tag-mention" data-tag-id="tag-work-id" data-label="work">#work</span> hi</p>',
    })]);
    await runOnce(); // re-export the note with the inline tag mention
    await fs.appendFile(path.join(dir, FILE), '\nedited by hand\n', 'utf8');

    await applyImport();
    const [note] = await repo.loadNotes();
    expect(note.content).toContain('data-tag-id="tag-work-id"');
    expect(note.content).toContain('data-label="work"');
  });

  test('a hand-added file becomes a new note with a tracking row', async () => {
    await fs.writeFile(path.join(dir, 'my-idea.md'), '# My Idea\n\nbody text\n', 'utf8');
    const counts = await applyImport();
    expect(counts.created).toBe(1);

    const notes = await repo.loadNotes();
    expect(notes).toHaveLength(2);
    const created = notes.find((n) => n.id !== ID);
    expect(created.content).toContain('body text');
    expect([...repo.__tracked.values()].some((t) => t.relPath === 'my-idea.md')).toBe(true);
  });

  // A hand-written file using #tags inline (no frontmatter tags:) should tag the
  // note, the same as typing #tag in the app — otherwise the mention renders but
  // shows no tag chip.
  test('inline #tags in a hand-made file attach as real tags on the new note', async () => {
    await fs.writeFile(path.join(dir, 'dinner.md'), 'plan with #cooking and #recipe\n', 'utf8');
    await applyImport();
    const created = (await repo.loadNotes()).find((n) => n.id !== ID);
    expect(created.tags).toEqual(expect.arrayContaining(['cooking', 'recipe']));
  });

  // Importing an Obsidian-style library should keep each note's date. With no
  // `created:` in the file, the note takes the file's own (earlier of birth/mtime)
  // date instead of "now", so chronology survives.
  test('a new file with no frontmatter created keeps the file’s own date', async () => {
    const p = path.join(dir, 'old-idea.md');
    await fs.writeFile(p, '# Old idea\n\nfrom way back\n', 'utf8');
    const past = new Date('2021-03-04T05:06:07Z');
    await fs.utimes(p, past, past); // birth time stays ~now; mtime moves to the past
    await applyImport();
    const created = (await repo.loadNotes()).find((n) => n.id !== ID);
    expect(new Date(created.created).getUTCFullYear()).toBe(2021);
  });

  // The crux of safe hand-editing: an imported file must keep the name the user
  // gave it. If the export renamed it to a slug-id, the user's still-open editor
  // would re-save the old name as a brand-new (untracked) file → a duplicate note.
  test('an imported hand-made file keeps its filename after the next export', async () => {
    await fs.writeFile(path.join(dir, 'my-idea.md'), '# My Idea\n\nbody text\n', 'utf8');
    await applyImport();

    // The export side now runs and must rewrite in place (add frontmatter), NOT
    // rename to a slug-id filename.
    const summary = await runOnce();
    expect(summary.renamed).toBe(0);

    const files = await fs.readdir(dir);
    expect(files).toContain('my-idea.md');
    expect(files.filter((f) => f.endsWith('.md'))).toHaveLength(2); // original note + this one
    const file = await fs.readFile(path.join(dir, 'my-idea.md'), 'utf8');
    expect(file).toContain('id:'); // frontmatter added in place
  });

  test('a file edited AND the note edited → DB wins, on-disk edit saved to conflicts/', async () => {
    // Diverge the DB note, then edit the same file differently on disk.
    repo.__setNotes([baseNote({ content: '<p>DB CHANGED</p>' })]);
    await fs.appendFile(path.join(dir, FILE), '\nDISK CHANGED\n', 'utf8');

    const counts = await applyImport();
    expect(counts.conflict).toBe(1);

    // DB content is untouched (DB won).
    const [note] = await repo.loadNotes();
    expect(note.content).toBe('<p>DB CHANGED</p>');

    // Main file now reflects the DB; the on-disk edit is preserved in conflicts/.
    const mainFile = await fs.readFile(path.join(dir, FILE), 'utf8');
    expect(mainFile).toContain('DB CHANGED');
    const conflicts = await fs.readdir(path.join(dir, 'conflicts'));
    expect(conflicts).toHaveLength(1);
    const saved = await fs.readFile(path.join(dir, 'conflicts', conflicts[0]), 'utf8');
    expect(saved).toContain('DISK CHANGED');

    // Conflict files live outside the scan, so they're never re-imported.
    const after = await previewImport();
    expect(after.conflict).toEqual([]);
    expect(after.created).toEqual([]);
  });

  test('a deleted file is ignored — the note survives and is not recreated by apply', async () => {
    await fs.unlink(path.join(dir, FILE));
    const counts = await applyImport();
    expect(counts.missing).toBe(1);

    const notes = await repo.loadNotes();
    expect(notes).toHaveLength(1);
    expect(await fs.readdir(dir)).not.toContain(FILE); // apply doesn't re-create it
    expect(repo.__tracked.has(ID)).toBe(true);
  });

  test('a renamed file just repoints the tracking row', async () => {
    await fs.rename(path.join(dir, FILE), path.join(dir, 'renamed.md'));
    const counts = await applyImport();
    expect(counts.renamed).toBe(1);
    expect(repo.__tracked.get(ID).relPath).toBe('renamed.md');

    const [note] = await repo.loadNotes();
    expect(note.content).toBe('<p>hi <strong>there</strong></p>'); // content untouched
  });

  // The route uses these ids to replay note_created / note_updated socket events,
  // since the import bypasses the note routes that normally broadcast.
  test('reports created and content-changed note ids for live broadcast', async () => {
    await fs.appendFile(path.join(dir, FILE), '\nedited by hand\n', 'utf8'); // → updated
    await fs.writeFile(path.join(dir, 'my-idea.md'), '# My Idea\n\nbody\n', 'utf8'); // → created
    const result = await applyImport();
    expect(result.updatedIds).toEqual([ID]);
    expect(result.createdIds).toHaveLength(1);
    expect(result.createdIds[0]).not.toBe(ID);
  });

  test('a pure rename broadcasts nothing — the note content is untouched', async () => {
    await fs.rename(path.join(dir, FILE), path.join(dir, 'renamed.md'));
    const result = await applyImport();
    expect(result.createdIds).toEqual([]);
    expect(result.updatedIds).toEqual([]);
  });

  test('skips cleanly when the feature is disabled', async () => {
    delete process.env.MD_MIRROR_ENABLED;
    expect(await applyImport()).toEqual({ skipped: true, reason: 'disabled' });
  });
});

describe('autoImportTick (unattended folder → DB)', () => {
  const FILE = 'hello-world-4f3c8a2b.md';
  let dir;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-auto-'));
    process.env.MD_MIRROR_ENABLED = 'true';
    process.env.MD_MIRROR_PATH = dir;
    repo.__tracked.clear();
    repo.__setNotes([baseNote()]);
    await runOnce(); // seed folder + tracking from one note
  });
  afterEach(async () => {
    delete process.env.MD_MIRROR_ENABLED;
    delete process.env.MD_MIRROR_PATH;
    delete process.env.MD_MIRROR_AUTO_IMPORT;
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('off by default: a file edit is NOT pulled in', async () => {
    await fs.appendFile(path.join(dir, FILE), '\nedited by hand\n', 'utf8');
    await autoImportTick();
    const [note] = await repo.loadNotes();
    expect(note.content).not.toContain('edited by hand');
  });

  test('on: a file edit is pulled into the note unattended', async () => {
    process.env.MD_MIRROR_AUTO_IMPORT = 'true';
    await fs.appendFile(path.join(dir, FILE), '\nedited by hand\n', 'utf8');
    await autoImportTick();
    const [note] = await repo.loadNotes();
    expect(note.content).toContain('edited by hand');

    // Nothing left to pull, so a second tick is a clean no-op.
    const before = JSON.stringify(await repo.loadNotes());
    await autoImportTick();
    expect(JSON.stringify(await repo.loadNotes())).toBe(before);
  });

  // The whole point of fingerprinting without `updated:`: an import bumps the note's
  // updated_at, but a timestamp-only change must NOT make the next export rewrite the
  // file — that rewrite is the "external changes" echo into an open editor.
  test('a note whose only change is its updated timestamp is not rewritten (no echo)', async () => {
    const before = await fs.readFile(path.join(dir, FILE), 'utf8');

    // Exactly what an import leaves behind: a fresh updated_at, nothing else changed.
    repo.__setNotes([baseNote({ updated: '2026-06-22T12:00:00Z' })]);
    const summary = await runOnce();

    expect(summary.updated).toBe(0);
    expect(summary.renamed).toBe(0);
    expect(await fs.readFile(path.join(dir, FILE), 'utf8')).toBe(before);
  });
});

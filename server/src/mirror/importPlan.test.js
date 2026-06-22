'use strict';

const { planImport } = require('./importPlan');

// tracked rows as a Map<noteId, {relPath, hash}>, built from a plain object for brevity.
function trackedMap(obj) {
  return new Map(Object.entries(obj));
}

describe('planImport', () => {
  test('unchanged: disk hash matches the tracked hash', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'h1', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.unchanged).toEqual([{ noteId: 'n1', relPath: 'a.md' }]);
    expect(plan.edited).toEqual([]);
    expect(plan.created).toEqual([]);
    expect(plan.renamed).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  test('edited: same path, hash drifted', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'h2', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.edited).toEqual([{ noteId: 'n1', relPath: 'a.md', hash: 'h2' }]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  test('created with a frontmatter id we do not track', () => {
    const tracked = trackedMap({});
    const diskFiles = [{ relPath: 'new.md', hash: 'h9', id: 'unknown-id' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.created).toEqual([{ relPath: 'new.md', hash: 'h9', id: 'unknown-id' }]);
  });

  test('created with no frontmatter id (hand-made file)', () => {
    const tracked = trackedMap({});
    const diskFiles = [{ relPath: 'hand.md', hash: 'h9', id: null }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.created).toEqual([{ relPath: 'hand.md', hash: 'h9', id: null }]);
  });

  test('renamed: id matches a tracked note now at a new path, body unchanged', () => {
    const tracked = trackedMap({ n1: { relPath: 'old.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'new.md', hash: 'h1', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.renamed).toEqual([
      { noteId: 'n1', oldPath: 'old.md', relPath: 'new.md', hash: 'h1', alsoEdited: false },
    ]);
    expect(plan.missing).toEqual([]);
    expect(plan.created).toEqual([]);
  });

  test('renamed + edited: moved AND the content drifted', () => {
    const tracked = trackedMap({ n1: { relPath: 'old.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'new.md', hash: 'h2', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.renamed).toEqual([
      { noteId: 'n1', oldPath: 'old.md', relPath: 'new.md', hash: 'h2', alsoEdited: true },
    ]);
  });

  test('missing: a tracked note whose file is gone from disk', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'h1' } });
    const plan = planImport({ diskFiles: [], tracked });
    expect(plan.missing).toEqual([{ noteId: 'n1', relPath: 'a.md' }]);
  });

  test('a renamed note is not also reported missing', () => {
    const tracked = trackedMap({ n1: { relPath: 'old.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'new.md', hash: 'h1', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.missing).toEqual([]);
    expect(plan.renamed).toHaveLength(1);
  });

  test('mixed scene: one of each bucket', () => {
    const tracked = trackedMap({
      keep: { relPath: 'keep.md', hash: 'hk' },
      edit: { relPath: 'edit.md', hash: 'he1' },
      move: { relPath: 'move-old.md', hash: 'hm' },
      gone: { relPath: 'gone.md', hash: 'hg' },
    });
    const diskFiles = [
      { relPath: 'keep.md', hash: 'hk', id: 'keep' },        // unchanged
      { relPath: 'edit.md', hash: 'he2', id: 'edit' },       // edited
      { relPath: 'move-new.md', hash: 'hm', id: 'move' },    // renamed
      { relPath: 'fresh.md', hash: 'hf', id: null },         // created
    ];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.unchanged).toEqual([{ noteId: 'keep', relPath: 'keep.md' }]);
    expect(plan.edited).toEqual([{ noteId: 'edit', relPath: 'edit.md', hash: 'he2' }]);
    expect(plan.renamed).toEqual([
      { noteId: 'move', oldPath: 'move-old.md', relPath: 'move-new.md', hash: 'hm', alsoEdited: false },
    ]);
    expect(plan.created).toEqual([{ relPath: 'fresh.md', hash: 'hf', id: null }]);
    expect(plan.missing).toEqual([{ noteId: 'gone', relPath: 'gone.md' }]);
  });

  test('a file whose path is tracked wins over its id (no double-count)', () => {
    // Same note appears at its tracked path; its id should not also trigger a rename.
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'h1' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'h1', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.renamed).toEqual([]);
  });

  test('empty inputs yield empty buckets', () => {
    const plan = planImport({ diskFiles: [], tracked: new Map() });
    expect(plan).toEqual({ unchanged: [], edited: [], conflict: [], created: [], renamed: [], missing: [] });
  });
});

describe('planImport — conflict detection (dbHashes supplied)', () => {
  test('file edited, DB unchanged → edited (no conflict)', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'synced' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'fileEdit', id: 'n1' }];
    const dbHashes = new Map([['n1', 'synced']]); // DB still matches last sync
    const plan = planImport({ diskFiles, tracked, dbHashes });
    expect(plan.edited).toEqual([{ noteId: 'n1', relPath: 'a.md', hash: 'fileEdit' }]);
    expect(plan.conflict).toEqual([]);
  });

  test('file AND DB both changed to different content → conflict', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'synced' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'fileEdit', id: 'n1' }];
    const dbHashes = new Map([['n1', 'dbEdit']]); // DB moved too, elsewhere
    const plan = planImport({ diskFiles, tracked, dbHashes });
    expect(plan.conflict).toEqual([{ noteId: 'n1', relPath: 'a.md', hash: 'fileEdit' }]);
    expect(plan.edited).toEqual([]);
  });

  test('file and DB independently converged on the same content → unchanged', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'synced' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'same', id: 'n1' }];
    const dbHashes = new Map([['n1', 'same']]);
    const plan = planImport({ diskFiles, tracked, dbHashes });
    expect(plan.unchanged).toEqual([{ noteId: 'n1', relPath: 'a.md' }]);
    expect(plan.conflict).toEqual([]);
    expect(plan.edited).toEqual([]);
  });

  test('without dbHashes, an edit is never classified as a conflict', () => {
    const tracked = trackedMap({ n1: { relPath: 'a.md', hash: 'synced' } });
    const diskFiles = [{ relPath: 'a.md', hash: 'fileEdit', id: 'n1' }];
    const plan = planImport({ diskFiles, tracked });
    expect(plan.edited).toHaveLength(1);
    expect(plan.conflict).toEqual([]);
  });
});

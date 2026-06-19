'use strict';

const { planReconcile } = require('./reconcile');

const N1 = '11111111-0000-0000-0000-000000000000';
const N2 = '22222222-0000-0000-0000-000000000000';

const run = ({ desired = [], tracked = new Map(), onDisk = new Set() }) =>
  planReconcile({ desired, tracked, onDisk });

describe('planReconcile', () => {
  test('initial export: untracked notes become creates', () => {
    const actions = run({
      desired: [
        { noteId: N1, relPath: 'a-111.md', hash: 'h1' },
        { noteId: N2, relPath: 'b-222.md', hash: 'h2' },
      ],
    });
    expect(actions).toEqual([
      { type: 'create', noteId: N1, relPath: 'a-111.md', hash: 'h1' },
      { type: 'create', noteId: N2, relPath: 'b-222.md', hash: 'h2' },
    ]);
  });

  test('unchanged note is skipped (no action)', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'a-111.md', hash: 'h1' }],
      tracked: new Map([[N1, { relPath: 'a-111.md', hash: 'h1' }]]),
      onDisk: new Set(['a-111.md']),
    });
    expect(actions).toEqual([]);
  });

  test('content change on same path is an update', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'a-111.md', hash: 'h2' }],
      tracked: new Map([[N1, { relPath: 'a-111.md', hash: 'h1' }]]),
      onDisk: new Set(['a-111.md']),
    });
    expect(actions).toEqual([{ type: 'update', noteId: N1, relPath: 'a-111.md', hash: 'h2' }]);
  });

  test('missing file (deleted externally) is recreated even when hash matches', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'a-111.md', hash: 'h1' }],
      tracked: new Map([[N1, { relPath: 'a-111.md', hash: 'h1' }]]),
      onDisk: new Set(),
    });
    expect(actions).toEqual([{ type: 'update', noteId: N1, relPath: 'a-111.md', hash: 'h1' }]);
  });

  test('title change renames the file (content unchanged)', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'new-111.md', hash: 'h1' }],
      tracked: new Map([[N1, { relPath: 'old-111.md', hash: 'h1' }]]),
      onDisk: new Set(['old-111.md']),
    });
    expect(actions).toEqual([
      { type: 'rename', noteId: N1, oldPath: 'old-111.md', relPath: 'new-111.md', hash: 'h1', rewrite: false },
    ]);
  });

  test('title + content change renames and rewrites', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'new-111.md', hash: 'h2' }],
      tracked: new Map([[N1, { relPath: 'old-111.md', hash: 'h1' }]]),
      onDisk: new Set(['old-111.md']),
    });
    expect(actions[0]).toMatchObject({ type: 'rename', rewrite: true, relPath: 'new-111.md' });
  });

  test('rename target falls back to create when old file is gone', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'new-111.md', hash: 'h1' }],
      tracked: new Map([[N1, { relPath: 'old-111.md', hash: 'h1' }]]),
      onDisk: new Set(),
    });
    expect(actions).toEqual([{ type: 'create', noteId: N1, relPath: 'new-111.md', hash: 'h1' }]);
  });

  test('trashing moves the file (path prefix change is just a rename)', () => {
    const actions = run({
      desired: [{ noteId: N1, relPath: 'trash/a-111.md', hash: 'h1' }],
      tracked: new Map([[N1, { relPath: 'a-111.md', hash: 'h1' }]]),
      onDisk: new Set(['a-111.md']),
    });
    expect(actions).toEqual([
      { type: 'rename', noteId: N1, oldPath: 'a-111.md', relPath: 'trash/a-111.md', hash: 'h1', rewrite: false },
    ]);
  });

  test('deleted note (no longer live) removes its file', () => {
    const actions = run({
      desired: [],
      tracked: new Map([[N1, { relPath: 'a-111.md', hash: 'h1' }]]),
      onDisk: new Set(['a-111.md']),
    });
    expect(actions).toEqual([{ type: 'delete', noteId: N1, oldPath: 'a-111.md' }]);
  });

  test('mixed sweep produces create + update + delete together', () => {
    const actions = run({
      desired: [
        { noteId: N1, relPath: 'a-111.md', hash: 'h1b' }, // changed
        { noteId: N2, relPath: 'b-222.md', hash: 'h2' }, // new
      ],
      tracked: new Map([
        [N1, { relPath: 'a-111.md', hash: 'h1a' }],
        ['33333333-0000-0000-0000-000000000000', { relPath: 'gone-333.md', hash: 'h3' }],
      ]),
      onDisk: new Set(['a-111.md', 'gone-333.md']),
    });
    expect(actions).toContainEqual({ type: 'update', noteId: N1, relPath: 'a-111.md', hash: 'h1b' });
    expect(actions).toContainEqual({ type: 'create', noteId: N2, relPath: 'b-222.md', hash: 'h2' });
    expect(actions).toContainEqual({ type: 'delete', noteId: '33333333-0000-0000-0000-000000000000', oldPath: 'gone-333.md' });
  });
});

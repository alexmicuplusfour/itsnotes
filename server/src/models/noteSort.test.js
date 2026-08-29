const { ORDER_SPECS, normalizeListSort, normalizeSearchSort, defaultListSort } = require('./noteSort');

describe('ORDER_SPECS', () => {
  test('every spec ends with the id tiebreaker', () => {
    for (const [name, spec] of Object.entries(ORDER_SPECS)) {
      const last = spec[spec.length - 1];
      expect({ name, column: last.column }).toEqual({ name, column: 'notes.id' });
    }
  });

  test('tiebreaker direction matches the primary direction', () => {
    for (const spec of Object.values(ORDER_SPECS)) {
      expect(spec[spec.length - 1].order).toBe(spec[0].order);
    }
  });

  test('archive and trash recency sorts push nulls last', () => {
    expect(ORDER_SPECS.archived_desc[0]).toMatchObject({ column: 'notes.archived_at', nulls: 'last' });
    expect(ORDER_SPECS.trashed_desc[0]).toMatchObject({ column: 'notes.trashed_at', nulls: 'last' });
  });
});

describe('normalizeListSort', () => {
  test('canonical names pass through', () => {
    for (const name of Object.keys(ORDER_SPECS)) {
      expect(normalizeListSort({ sort: name })).toBe(name);
    }
  });

  test('canonical name wins over legacy aliases', () => {
    expect(normalizeListSort({ sort: 'updated_desc', sortCriteria: 'created_at', oldestFirst: true })).toBe('updated_desc');
  });

  test('legacy sortCriteria=created_at maps by oldestFirst', () => {
    expect(normalizeListSort({ sortCriteria: 'created_at', oldestFirst: false })).toBe('created_desc');
    expect(normalizeListSort({ sortCriteria: 'created_at', oldestFirst: true })).toBe('created_asc');
  });

  test('legacy bare oldestFirst=true means created_asc (as documented)', () => {
    expect(normalizeListSort({ oldestFirst: true })).toBe('created_asc');
    expect(normalizeListSort({ oldestFirst: true, deleted: true })).toBe('created_asc');
  });

  test('unknown or missing sort falls back to the view default', () => {
    expect(normalizeListSort({})).toBe('created_desc');
    expect(normalizeListSort({ sort: 'nonsense' })).toBe('created_desc');
    expect(normalizeListSort({ sort: 'nonsense', archived: true })).toBe('archived_desc');
    expect(normalizeListSort({ sort: 'nonsense', deleted: true })).toBe('trashed_desc');
    expect(normalizeListSort({ archived: true })).toBe('archived_desc');
    expect(normalizeListSort({ deleted: true })).toBe('trashed_desc');
  });

  test('legacy sortCriteria for archive/trash recency falls through to the view default', () => {
    expect(normalizeListSort({ sortCriteria: 'archived_at', archived: true })).toBe('archived_desc');
    expect(normalizeListSort({ sortCriteria: 'trashed_at', deleted: true })).toBe('trashed_desc');
  });

  test('no arguments at all defaults to created_desc', () => {
    expect(normalizeListSort()).toBe('created_desc');
  });
});

describe('normalizeSearchSort', () => {
  test('canonical names pass through', () => {
    for (const name of Object.keys(ORDER_SPECS)) {
      expect(normalizeSearchSort(name)).toBe(name);
    }
  });

  test('documented camelCase aliases map to canonical names', () => {
    expect(normalizeSearchSort('updatedAt_desc')).toBe('updated_desc');
    expect(normalizeSearchSort('updatedAt_asc')).toBe('updated_asc');
    expect(normalizeSearchSort('createdAt_desc')).toBe('created_desc');
    expect(normalizeSearchSort('createdAt_asc')).toBe('created_asc');
  });

  test('unknown or missing values default to updated_desc', () => {
    expect(normalizeSearchSort(undefined)).toBe('updated_desc');
    expect(normalizeSearchSort('relevance')).toBe('updated_desc');
  });
});

describe('defaultListSort', () => {
  test('per-view defaults', () => {
    expect(defaultListSort({})).toBe('created_desc');
    expect(defaultListSort({ archived: true })).toBe('archived_desc');
    expect(defaultListSort({ deleted: true })).toBe('trashed_desc');
    expect(defaultListSort({ archived: true, deleted: true })).toBe('trashed_desc');
  });
});

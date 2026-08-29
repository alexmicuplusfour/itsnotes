import { describe, it, expect } from 'vitest';
import { groupNotesByMonth, MONTH_SHORT_NAMES } from './groupNotesByMonth';

const note = (id, created_at) => ({ id, created_at });

describe('groupNotesByMonth', () => {
  it('buckets notes by creation month, newest month first', () => {
    const groups = groupNotesByMonth([
      note('a', '2026-08-10T10:00:00'),
      note('b', '2026-06-02T10:00:00'),
      note('c', '2026-08-27T10:00:00'),
    ]);
    expect(groups.map(g => g.label)).toEqual(['August 2026', 'June 2026']);
    expect(groups[0].notes.map(n => n.id)).toEqual(['a', 'c']);
    expect(groups[1].notes.map(n => n.id)).toEqual(['b']);
  });

  it('reverses group order when the list is oldest-first', () => {
    const groups = groupNotesByMonth([
      note('a', '2026-08-10T10:00:00'),
      note('b', '2026-06-02T10:00:00'),
    ], { oldestFirst: true });
    expect(groups.map(g => g.label)).toEqual(['June 2026', 'August 2026']);
  });

  it('keeps the same month in different years apart', () => {
    const groups = groupNotesByMonth([
      note('a', '2026-08-10T10:00:00'),
      note('b', '2025-08-10T10:00:00'),
    ]);
    expect(groups.map(g => g.label)).toEqual(['August 2026', 'August 2025']);
  });

  it('carries the fields the separators and sticky header read', () => {
    const [group] = groupNotesByMonth([note('a', '2026-08-10T10:00:00')]);
    expect(group).toMatchObject({ label: 'August 2026', year: 2026, month: 8, monthShort: 'aug' });
    expect(typeof group.timestamp).toBe('number');
  });

  it('preserves the order notes arrive in within a month', () => {
    const [group] = groupNotesByMonth([
      note('first', '2026-08-27T10:00:00'),
      note('second', '2026-08-02T10:00:00'),
    ]);
    expect(group.notes.map(n => n.id)).toEqual(['first', 'second']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupNotesByMonth([])).toEqual([]);
  });

  it('exposes twelve short month names', () => {
    expect(MONTH_SHORT_NAMES).toHaveLength(12);
    expect(MONTH_SHORT_NAMES[0]).toBe('jan');
    expect(MONTH_SHORT_NAMES[11]).toBe('dec');
  });
});

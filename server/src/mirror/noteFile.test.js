'use strict';

const yaml = require('js-yaml');
const { buildFrontmatter, renderNoteFile, formatTimestamp } = require('./noteFile');

const baseNote = {
  id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f',
  title: 'Weekend',
  color: 'teal',
  pinned: true,
  archived: false,
  trashed: false,
  tags: ['reading', 'films'],
  folders: ['Personal'],
  created: '2026-06-19T10:30:00.000Z',
  updated: '2026-06-19T11:05:00.000Z',
  content: '<p>hello <strong>world</strong></p>',
};

// Parse the `---` fenced frontmatter back out of a rendered file.
function parseFrontmatter(file) {
  const m = file.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error('no frontmatter found');
  return yaml.load(m[1]);
}

describe('formatTimestamp', () => {
  test('ISO string -> Joplin-style UTC, space separator, no zone', () => {
    expect(formatTimestamp('2026-06-19T10:30:00.000Z')).toBe('2026-06-19 10:30:00');
  });
  test('Date object', () => {
    expect(formatTimestamp(new Date(Date.UTC(2026, 5, 19, 9, 0, 0)))).toBe('2026-06-19 09:00:00');
  });
  test('null / invalid -> null', () => {
    expect(formatTimestamp(null)).toBeNull();
    expect(formatTimestamp('not a date')).toBeNull();
  });
});

describe('buildFrontmatter', () => {
  test('emits every field in the spec order and parses back correctly', () => {
    const fm = buildFrontmatter(baseNote);
    const parsed = yaml.load(fm);
    expect(parsed).toMatchObject({
      id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f',
      title: 'Weekend',
      color: 'teal',
      pinned: true,
      archived: false,
      trashed: false,
      tags: ['reading', 'films'],
      folders: ['Personal'],
    });
    const keys = fm.split('\n').filter((l) => /^\w/.test(l)).map((l) => l.split(':')[0]);
    expect(keys).toEqual(['id', 'title', 'color', 'pinned', 'archived', 'trashed', 'tags', 'folders', 'created', 'updated']);
  });

  test('empty tags/folders render as []', () => {
    const fm = buildFrontmatter({ ...baseNote, tags: [], folders: [] });
    expect(fm).toContain('tags: []');
    expect(fm).toContain('folders: []');
  });

  test('reminders key omitted entirely when none', () => {
    const fm = buildFrontmatter({ ...baseNote });
    expect(fm).not.toContain('reminders:');
  });

  test('reminders rendered with at/timezone/rrule; rrule optional', () => {
    const fm = buildFrontmatter({
      ...baseNote,
      reminders: [
        { at: '2026-06-21T09:00:00.000Z', timezone: 'Europe/Bucharest', rrule: 'FREQ=WEEKLY;BYDAY=SA' },
        { at: '2026-06-22T08:00:00.000Z', timezone: 'UTC' },
      ],
    });
    const parsed = yaml.load(fm);
    expect(parsed.reminders).toHaveLength(2);
    expect(parsed.reminders[0]).toMatchObject({ timezone: 'Europe/Bucharest', rrule: 'FREQ=WEEKLY;BYDAY=SA' });
    expect(parsed.reminders[1].rrule).toBeUndefined();
  });

  test('special characters in title are safely quoted', () => {
    const fm = buildFrontmatter({ ...baseNote, title: 'a: b #c "quoted"' });
    expect(yaml.load(fm).title).toBe('a: b #c "quoted"');
  });

  test('tag names with special characters are safely quoted', () => {
    const fm = buildFrontmatter({ ...baseNote, tags: ['c++', 'to: do'] });
    expect(yaml.load(fm).tags).toEqual(['c++', 'to: do']);
  });

  test('null title and default color fall back gracefully', () => {
    const fm = buildFrontmatter({ ...baseNote, title: null, color: null });
    const parsed = yaml.load(fm);
    expect(parsed.title).toBe('');
    expect(parsed.color).toBe('default');
  });
});

describe('renderNoteFile', () => {
  test('produces fenced frontmatter + converted body', () => {
    const file = renderNoteFile(baseNote);
    expect(file.startsWith('---\n')).toBe(true);
    expect(parseFrontmatter(file).id).toBe(baseNote.id);
    expect(file).toContain('hello **world**');
  });

  test('empty body: frontmatter only, no trailing body block', () => {
    const file = renderNoteFile({ ...baseNote, content: '<p></p>' });
    expect(file.match(/---/g)).toHaveLength(2);
    expect(file.endsWith('---\n')).toBe(true);
  });

  test('forwards resolver options to the converter', () => {
    const file = renderNoteFile(
      { ...baseNote, content: '<p><img data-image-id="9" alt="x"></p>' },
      { resolveImage: (id) => `img-${id}.png` },
    );
    expect(file).toContain('![x](_resources/img-9.png)');
  });
});

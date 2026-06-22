'use strict';

const { fileToNoteFields } = require('./importApply');
const { renderNoteFile } = require('./noteFile');

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

describe('fileToNoteFields', () => {
  test('maps frontmatter + body of a rendered file into note column values', () => {
    const out = fileToNoteFields(renderNoteFile(baseNote));
    expect(out.id).toBe(baseNote.id);
    expect(out.fields).toMatchObject({
      title: 'Weekend',
      color: 'teal',
      is_pinned: true,
      is_archived: false,
      is_deleted: false,
    });
    expect(out.fields.content).toContain('<strong>world</strong>');
    expect(out.tags).toEqual(['reading', 'films']);
    expect(out.folders).toEqual(['Personal']);
    expect(out.created).toBe(baseNote.created);
  });

  test('converts the Markdown body back to Tiptap HTML', () => {
    const file = renderNoteFile({ ...baseNote, content: '<ul><li>a</li><li>b</li></ul>' });
    const out = fileToNoteFields(file);
    expect(out.fields.content).toContain('<ul>');
    expect(out.fields.content).toContain('<li>');
  });

  test('a hand-made file with no frontmatter gets safe defaults', () => {
    const out = fileToNoteFields('just some text\n');
    expect(out.id).toBeNull();
    expect(out.fields.title).toBe('');
    expect(out.fields.color).toBe('default');
    expect(out.fields.is_pinned).toBe(false);
    expect(out.tags).toEqual([]);
    expect(out.folders).toEqual([]);
    expect(out.fields.content).toContain('just some text');
  });

  test('an empty body maps to empty content', () => {
    const out = fileToNoteFields(renderNoteFile({ ...baseNote, content: '<p></p>' }));
    expect(out.fields.content).toBe('');
  });

  test('trashed frontmatter maps to is_deleted', () => {
    const out = fileToNoteFields(renderNoteFile({ ...baseNote, trashed: true }));
    expect(out.fields.is_deleted).toBe(true);
  });
});

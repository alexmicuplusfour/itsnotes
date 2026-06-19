'use strict';

const { slugify, slugSource, shortId, noteFileName } = require('./slugify');

describe('slugify', () => {
  test('lowercases and hyphenates whitespace', () => {
    expect(slugify('Shopping List')).toBe('shopping-list');
    expect(slugify('  Q1   project   kickoff ')).toBe('q1-project-kickoff');
  });
  test('strips Windows-forbidden characters', () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });
  test('collapses repeated hyphens and trims separators/dots', () => {
    expect(slugify('--hello---world..')).toBe('hello-world');
    expect(slugify('...dotfile')).toBe('dotfile');
  });
  test('caps length at 80 without trailing separator', () => {
    const out = slugify('a '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('-')).toBe(false);
  });
  test('keeps unicode letters', () => {
    expect(slugify('Belém')).toBe('belém');
  });
  test('empty / null input yields empty string', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
  });
});

describe('shortId', () => {
  test('first 8 hex chars of a UUID, no dashes', () => {
    expect(shortId('4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f')).toBe('4f3c8a2b');
  });
  test('falls back when missing', () => {
    expect(shortId(null)).toBe('noid');
  });
});

describe('slugSource', () => {
  test('prefers the title', () => {
    expect(slugSource({ title: 'My Note', plainContent: 'ignored' })).toBe('my-note');
  });
  test('falls back to first non-empty line of plain content', () => {
    expect(slugSource({ title: '  ', plainContent: '\n\n  buy milk and eggs\nmore' })).toBe('buy-milk-and-eggs');
  });
  test('falls back to "untitled" when nothing usable', () => {
    expect(slugSource({ title: '', plainContent: '   \n  ' })).toBe('untitled');
    expect(slugSource({ title: '***', plainContent: '' })).toBe('untitled');
  });
});

describe('noteFileName', () => {
  test('builds <slug>-<shortid>.md', () => {
    expect(noteFileName({ id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f', title: 'Shopping List' }))
      .toBe('shopping-list-4f3c8a2b.md');
  });
  test('guards reserved device names by prefixing underscore', () => {
    expect(noteFileName({ id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f', title: 'CON' }))
      .toBe('_con-4f3c8a2b.md');
  });
  test('untitled note still gets a stable filename', () => {
    expect(noteFileName({ id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f', title: '', plainContent: '' }))
      .toBe('untitled-4f3c8a2b.md');
  });
  test('extraId extends the shortid for clash resolution', () => {
    expect(noteFileName({ id: '4f3c8a2b-1c7d-4e2a-9b11-7f0a2c3d4e5f', title: 'x' }, '-1c7d'))
      .toBe('x-4f3c8a2b-1c7d.md');
  });
});

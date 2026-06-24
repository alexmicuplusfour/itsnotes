import { describe, test, expect } from 'vitest';
import { doesNoteMatchSearchQuery as matches } from './noteSearchMatch';

// Factory for a note as the client sees it over a socket: title, TRUNCATED html
// content, and the server-baked metadataSearchable string ("#tag $color yr:date").
const note = (over = {}) => ({
  id: 'note-1',
  title: '',
  content: '',
  metadataSearchable: '',
  ...over,
});

describe('doesNoteMatchSearchQuery - basics', () => {
  test('empty query matches everything', () => {
    expect(matches(note(), '')).toBe(true);
    expect(matches(note(), '   ')).toBe(true);
  });
  test('matches words in the title (case-insensitive)', () => {
    expect(matches(note({ title: 'Quarterly Meeting' }), 'meeting')).toBe(true);
  });
  test('matches words in the content', () => {
    expect(matches(note({ content: '<p>budget review</p>' }), 'budget')).toBe(true);
  });
  test('non-match returns false', () => {
    expect(matches(note({ title: 'groceries' }), 'meeting')).toBe(false);
  });
  test('multi-term is AND', () => {
    const n = note({ title: 'quarterly meeting', content: '<p>budget</p>' });
    expect(matches(n, 'meeting budget')).toBe(true);
    expect(matches(n, 'meeting payroll')).toBe(false);
  });
});

describe('doesNoteMatchSearchQuery - structured filters via metadata', () => {
  // These operators only "work" because the server ships metadataSearchable.
  const tagged = note({
    title: 'plan',
    metadataSearchable: '#work #important $red yr:2024:mar',
  });
  test('#tag matches via metadata', () => {
    expect(matches(tagged, '#work')).toBe(true);
    expect(matches(tagged, '#missing')).toBe(false);
  });
  test('$color matches via metadata', () => {
    expect(matches(tagged, '$red')).toBe(true);
    expect(matches(tagged, '$blue')).toBe(false);
  });
  test('yr: matches via metadata', () => {
    expect(matches(tagged, 'yr:2024')).toBe(true);
    expect(matches(tagged, 'yr:2023')).toBe(false);
  });
  test('tag + text combination', () => {
    expect(matches(tagged, '#work plan')).toBe(true);
    expect(matches(tagged, '#work groceries')).toBe(false);
  });
});

describe('doesNoteMatchSearchQuery - phrases, OR, exclusion, wildcard', () => {
  test('whole-query quoted phrase', () => {
    expect(matches(note({ content: '<p>quarterly meeting notes</p>' }), '"quarterly meeting"')).toBe(true);
    expect(matches(note({ content: '<p>meeting quarterly</p>' }), '"quarterly meeting"')).toBe(false);
  });
  test('OR group: at least one side matches', () => {
    expect(matches(note({ content: '<p>zoom call</p>' }), 'zoom OR teams')).toBe(true);
    expect(matches(note({ content: '<p>teams sync</p>' }), 'zoom OR teams')).toBe(true);
    expect(matches(note({ content: '<p>phone call</p>' }), 'zoom OR teams')).toBe(false);
  });
  test('exclusion within a multi-term query', () => {
    const n = note({ content: '<p>marketing strategy</p>' });
    expect(matches(n, 'marketing -growth')).toBe(true);
    expect(matches(note({ content: '<p>marketing growth</p>' }), 'marketing -growth')).toBe(false);
  });
  test('wildcard matches across intervening text', () => {
    expect(matches(note({ content: '<p>marketing growth strategy</p>' }), 'marketing*strategy')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// STRUCTURAL PARITY with the server tokenizer: parentheses are stripped and the
// spaced wildcard "a * b" is treated as adjacency (not a match-everything '*').
// Mirror of server/src/models/searchParse.test.js / searchSql.test.js — if the
// two tokenizers drift, one of these suites goes red.
// ---------------------------------------------------------------------------
describe('doesNoteMatchSearchQuery - structural parity with server', () => {
  test('parentheses around a single term are stripped', () => {
    expect(matches(note({ content: '<p>meeting notes</p>' }), '(meeting)')).toBe(true);
  });
  test('"(zoom OR teams) notes" matches a note with both', () => {
    expect(matches(note({ content: '<p>zoom call notes</p>' }), '(zoom OR teams) notes')).toBe(true);
    // Has the OR side but not "notes" -> no match.
    expect(matches(note({ content: '<p>teams sync</p>' }), '(zoom OR teams) notes')).toBe(false);
  });
  test('spaced wildcard "a * b" needs a word between (no match when adjacent)', () => {
    expect(matches(note({ content: '<p>marketing growth strategy</p>' }), 'marketing * strategy')).toBe(true);
    expect(matches(note({ content: '<p>marketing strategy</p>' }), 'marketing * strategy')).toBe(false);
  });
});

describe('doesNoteMatchSearchQuery - id search', () => {
  test('!<id> matches the exact note id', () => {
    expect(matches(note({ id: 'abc-123' }), '!abc-123')).toBe(true);
    expect(matches(note({ id: 'abc-123' }), '!zzz')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG FIX (this session): a wildcard regex built from raw user input can be an
// invalid regex. Previously `new RegExp(...)` threw, crashing the socket handler.
// It must now fail closed (no match) instead of throwing.
// ---------------------------------------------------------------------------
describe('doesNoteMatchSearchQuery - malformed wildcard does not throw', () => {
  test('"a*(" returns false instead of throwing', () => {
    expect(() => matches(note({ title: 'anything' }), 'a*(')).not.toThrow();
    expect(matches(note({ title: 'anything' }), 'a*(')).toBe(false);
  });
  test('malformed wildcard inside a multi-term query is contained', () => {
    expect(() => matches(note({ title: 'x' }), 'foo b*( bar')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DELIBERATE DIVERGENCES from the server engine. The client is a best-effort
// live-update matcher over truncated content; it is NOT meant to be identical to
// the server. These tests pin the current behaviour so the gaps are visible and
// intentional. (See server/src/models/searchSql.test.js for true semantics.)
// ---------------------------------------------------------------------------
describe('doesNoteMatchSearchQuery - known divergences from server (documented)', () => {
  test('searches raw HTML content, so a phrase across a tag boundary misses', () => {
    // Server searches plain_content ("hello world") and WOULD match. The client
    // only has html, where a tag sits between the words.
    const n = note({ content: '<p>hello</p><p>world</p>' });
    expect(matches(n, '"hello world"')).toBe(false);
  });
  test('a lone "-word" (no spaces) is literal text here, not an exclusion', () => {
    // Server parses "-cancelled" as excludedWords. The client single-term path
    // does a literal substring search for "-cancelled".
    expect(matches(note({ content: '<p>-cancelled</p>' }), '-cancelled')).toBe(true);
    expect(matches(note({ content: '<p>cancelled</p>' }), '-cancelled')).toBe(false);
  });
});

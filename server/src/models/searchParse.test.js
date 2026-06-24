'use strict';

// Harness for the search PARSING layer (DB-free, pure static methods on Note).
// This is where operator correctness is decided: parseSearchQuery turns the raw
// query string into the criteria object that the SQL builder consumes.
//
// Tests that assert CORRECT current behavior keep the suite green = trustworthy
// baseline. Two advertised operators are genuinely broken; those are encoded with
// `test.failing`, which passes while the bug exists and turns RED the moment the
// bug is fixed (prompting us to convert it to a normal test).

const Note = require('./Note');
const { SearchQueryBuilder } = Note;

// Silence the parser's console.log noise during tests.
beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => { console.log.mockRestore && console.log.mockRestore(); });

// Compact helper: assert only the criteria keys we care about for a query,
// and assert everything else is empty. Keeps expectations readable.
const EMPTY = {
  yearFilters: [], excludedYearFilters: [], colors: [], excludedColors: [],
  tags: [], excludedTags: [], textWords: [], excludedWords: [], orGroups: [],
  wildcards: [], exactPhrase: null, exactPhrases: [],
};
const parse = (q) => Note.parseSearchQuery(q);
const expectCriteria = (q, partial) =>
  expect(parse(q)).toEqual({ ...EMPTY, ...partial });

describe('tokenizeQuery', () => {
  test('splits on spaces', () => {
    expect(Note.tokenizeQuery('project meeting notes'))
      .toEqual(['project', 'meeting', 'notes']);
  });
  test('keeps double-quoted phrases together (quotes preserved)', () => {
    expect(Note.tokenizeQuery('"quarterly meeting" -cancelled'))
      .toEqual(['"quarterly meeting"', '-cancelled']);
  });
  test('keeps single-quoted phrases together', () => {
    expect(Note.tokenizeQuery("'team sync' notes"))
      .toEqual(["'team sync'", 'notes']);
  });
  test('drops empty tokens from collapsed whitespace', () => {
    expect(Note.tokenizeQuery('a    b')).toEqual(['a', 'b']);
  });
});

describe('parseYearFilter / monthNameToNumber', () => {
  test('year only', () => {
    expect(Note.parseYearFilter('2024')).toEqual({ year: 2024, month: null });
  });
  test('year + 3-letter month', () => {
    expect(Note.parseYearFilter('2024:dec')).toEqual({ year: 2024, month: 12 });
  });
  test('year + full month name (case-insensitive)', () => {
    expect(Note.parseYearFilter('2024:September')).toEqual({ year: 2024, month: 9 });
  });
  test('invalid month name yields null month (regex requires >=3 letters)', () => {
    // "may" is 3 letters and valid; a bogus month maps to null via monthNameToNumber
    expect(Note.parseYearFilter('2024:xyz')).toEqual({ year: 2024, month: null });
  });
  test('non-year string returns null', () => {
    expect(Note.parseYearFilter('hello')).toBeNull();
    expect(Note.parseYearFilter('24')).toBeNull(); // requires 4 digits
  });
  test('monthNameToNumber maps shorthand and full names', () => {
    expect(Note.monthNameToNumber('jan')).toBe(1);
    expect(Note.monthNameToNumber('MARCH')).toBe(3);
    expect(Note.monthNameToNumber('nope')).toBeNull();
    expect(Note.monthNameToNumber('')).toBeNull();
  });
});

describe('parseSearchQuery - basic text', () => {
  test('plain words become AND textWords', () => {
    expectCriteria('project meeting notes', {
      textWords: ['project', 'meeting', 'notes'],
    });
  });
  test('empty query returns all-empty criteria', () => {
    expectCriteria('', {});
    expectCriteria('   ', {});
  });
});

describe('parseSearchQuery - phrases', () => {
  test('whole-query quoted string becomes single exactPhrase', () => {
    expectCriteria('"quarterly meeting"', { exactPhrase: 'quarterly meeting' });
  });
  test('single-quoted whole query also becomes exactPhrase', () => {
    expectCriteria("'team sync'", { exactPhrase: 'team sync' });
  });
  test('phrase mixed with other terms becomes exactPhrases[] (AND)', () => {
    expectCriteria('"quarterly meeting" -cancelled', {
      exactPhrases: ['quarterly meeting'],
      excludedWords: ['cancelled'],
    });
  });
});

describe('parseSearchQuery - exclusion', () => {
  test('-word excludes a plain word', () => {
    expectCriteria('meeting -cancelled', {
      textWords: ['meeting'], excludedWords: ['cancelled'],
    });
  });
  test('-#tag excludes a tag', () => {
    expectCriteria('-#archived', { excludedTags: ['archived'] });
  });
  test('-$color excludes a color', () => {
    expectCriteria('-$red', { excludedColors: ['red'] });
  });
  test('-yr: excludes a year', () => {
    expectCriteria('-yr:2024', {
      excludedYearFilters: [{ year: 2024, month: null }],
    });
  });
});

describe('parseSearchQuery - tags & colors', () => {
  test('#tag and $color and leftover text', () => {
    expectCriteria('#important $red meeting', {
      tags: ['important'], colors: ['red'], textWords: ['meeting'],
    });
  });
  test('#parent tag (subtag expansion happens later in SQL, not in parse)', () => {
    expectCriteria('#book', { tags: ['book'] });
  });
});

describe('parseSearchQuery - year/month', () => {
  test('yr:YYYY:MMM plus a tag', () => {
    expectCriteria('yr:2024:dec #holidays', {
      yearFilters: [{ year: 2024, month: 12 }], tags: ['holidays'],
    });
  });
  test('yr:YYYY only', () => {
    expectCriteria('yr:2023', { yearFilters: [{ year: 2023, month: null }] });
  });
});

describe('parseSearchQuery - OR groups (no parentheses)', () => {
  test('a OR b becomes one OR group', () => {
    expectCriteria('zoom OR teams', { orGroups: [['zoom', 'teams']] });
  });
  test('chained a OR b OR c collapses into one group', () => {
    expectCriteria('a OR b OR c', { orGroups: [['a', 'b', 'c']] });
  });
  test('trailing OR is dropped, term kept as text', () => {
    expectCriteria('trailing OR', { textWords: ['trailing'] });
  });
  test('leading OR is dropped, term kept as text', () => {
    expectCriteria('OR leading', { textWords: ['leading'] });
  });
});

// ---------------------------------------------------------------------------
// Parentheses grouping (help advertises "(zoom OR teams) z"). Parens are purely
// decorative — grouping is driven by OR adjacency — so they must be stripped.
// ---------------------------------------------------------------------------
describe('parseSearchQuery - parentheses are stripped', () => {
  test('(zoom OR teams) meeting -> clean OR group + text', () => {
    expectCriteria('(zoom OR teams) meeting', {
      orGroups: [['zoom', 'teams']],
      textWords: ['meeting'],
    });
  });
  test('parens around a non-OR group still strip cleanly', () => {
    expectCriteria('project (meeting OR planning) -cancelled #important $yellow yr:2023', {
      textWords: ['project'],
      orGroups: [['meeting', 'planning']],
      excludedWords: ['cancelled'],
      tags: ['important'],
      colors: ['yellow'],
      yearFilters: [{ year: 2023, month: null }],
    });
  });
  test('quoted phrase containing parens is left intact', () => {
    expectCriteria('"(literal parens)"', { exactPhrase: '(literal parens)' });
  });
});

// ---------------------------------------------------------------------------
// Wildcards: the spaced adjacency form "a * b" (word, one word, word) and the
// glued form "a*b" should both yield a single wildcard token.
// ---------------------------------------------------------------------------
describe('parseSearchQuery - wildcards', () => {
  test('spaced "marketing * strategy" is one adjacency wildcard', () => {
    expectCriteria('marketing * strategy', {
      wildcards: ['marketing * strategy'],
    });
  });
  test('glued "marketing*strategy" is one wildcard token', () => {
    expectCriteria('marketing*strategy', { wildcards: ['marketing*strategy'] });
  });
  test('spaced wildcard alongside other terms', () => {
    expectCriteria('marketing * strategy #important', {
      wildcards: ['marketing * strategy'],
      tags: ['important'],
    });
  });
  test('lone "*" with no plain-word neighbours is not merged', () => {
    // "#a * $b" — neighbours are operators, so '*' stays a standalone wildcard.
    expectCriteria('#a * $b', {
      tags: ['a'], colors: ['b'], wildcards: ['*'],
    });
  });
});

// Lock in that the spaced adjacency wildcard compiles to the same regex the
// glued form produces — i.e. "word, exactly one word, word".
describe('createWildcardRegex - spaced and glued forms agree', () => {
  const builder = () => new SearchQueryBuilder();
  test('"a * b" and "a*b" yield the same adjacency pattern', () => {
    const b = builder();
    expect(b.createWildcardRegex('a * b')).toBe(b.createWildcardRegex('a*b'));
  });
  test('pattern encodes exactly one intervening word (Postgres regex dialect)', () => {
    const b = builder();
    // \m \M are Postgres word boundaries; \s+\w+\s+ is "exactly one word between".
    expect(b.createWildcardRegex('marketing * strategy'))
      .toBe('\\mmarketing\\M\\s+\\w+\\s+\\mstrategy\\M');
  });
});
